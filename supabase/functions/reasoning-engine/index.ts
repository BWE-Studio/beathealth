import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const requestSchema = z.object({
  userId: z.string().uuid(),
  analysisType: z.enum(['full', 'quick', 'targeted']).optional().default('full'),
});

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

interface HealthContext {
  profile: any;
  conditions: string[];
  recentBP: any[];
  recentSugar: any[];
  recentMeals: any[];
  recentActivity: any[];
  medications: any[];
  cgmData: any[];
  heartScores: any[];
}

async function getHealthContext(supabase: any, userId: string): Promise<HealthContext> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    profileResult,
    bpResult,
    sugarResult,
    mealsResult,
    activityResult,
    medsResult,
    cgmResult,
    scoresResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('bp_logs').select('*').eq('user_id', userId)
      .gte('measured_at', thirtyDaysAgo.toISOString()).order('measured_at', { ascending: false }).limit(60),
    supabase.from('sugar_logs').select('*').eq('user_id', userId)
      .gte('measured_at', thirtyDaysAgo.toISOString()).order('measured_at', { ascending: false }).limit(100),
    supabase.from('meal_logs').select('*').eq('user_id', userId)
      .gte('logged_at', thirtyDaysAgo.toISOString()).order('logged_at', { ascending: false }).limit(30),
    supabase.from('activity_sessions').select('*').eq('user_id', userId)
      .gte('started_at', thirtyDaysAgo.toISOString()).order('started_at', { ascending: false }).limit(30),
    supabase.from('medications').select('*').eq('user_id', userId).eq('active', true),
    supabase.from('cgm_readings').select('*').eq('user_id', userId)
      .gte('measured_at', thirtyDaysAgo.toISOString()).order('measured_at', { ascending: false }).limit(500),
    supabase.from('heart_scores').select('*').eq('user_id', userId)
      .gte('score_date', thirtyDaysAgo.toISOString().split('T')[0]).order('score_date', { ascending: false }).limit(30),
  ]);

  const profile = profileResult.data;
  
  // Determine conditions from profile
  const conditions: string[] = [];
  if (profile?.has_diabetes) conditions.push('diabetes');
  if (profile?.has_hypertension) conditions.push('hypertension');
  if (profile?.has_heart_disease) conditions.push('heart_disease');
  
  // Check for obesity from weight/height if available
  if (profile?.weight_kg && profile?.height_cm) {
    const heightM = profile.height_cm / 100;
    const bmi = profile.weight_kg / (heightM * heightM);
    if (bmi >= 30) conditions.push('obesity');
    else if (bmi >= 25) conditions.push('overweight');
  }

  return {
    profile,
    conditions,
    recentBP: bpResult.data || [],
    recentSugar: sugarResult.data || [],
    recentMeals: mealsResult.data || [],
    recentActivity: activityResult.data || [],
    medications: medsResult.data || [],
    cgmData: cgmResult.data || [],
    heartScores: scoresResult.data || [],
  };
}

function analyzeVitalTrends(context: HealthContext) {
  const trends: any = {
    bp: { status: 'unknown', trend: 'stable', avgSystolic: 0, avgDiastolic: 0 },
    sugar: { status: 'unknown', trend: 'stable', avgFasting: 0, timeInRange: 0 },
    activity: { avgSteps: 0, avgCalories: 0, activeMinutes: 0 },
    meals: { avgCalories: 0, avgCarbs: 0, avgGL: 0 },
  };

  // BP Analysis
  if (context.recentBP.length > 0) {
    const avgSys = context.recentBP.reduce((s, b) => s + b.systolic, 0) / context.recentBP.length;
    const avgDia = context.recentBP.reduce((s, b) => s + b.diastolic, 0) / context.recentBP.length;
    trends.bp.avgSystolic = Math.round(avgSys);
    trends.bp.avgDiastolic = Math.round(avgDia);
    
    if (avgSys < 120 && avgDia < 80) trends.bp.status = 'optimal';
    else if (avgSys < 130 && avgDia < 85) trends.bp.status = 'normal';
    else if (avgSys < 140 && avgDia < 90) trends.bp.status = 'elevated';
    else trends.bp.status = 'high';

    // Check trend (last 7 vs previous 7)
    if (context.recentBP.length >= 14) {
      const recent7 = context.recentBP.slice(0, 7);
      const prev7 = context.recentBP.slice(7, 14);
      const recentAvg = recent7.reduce((s, b) => s + b.systolic, 0) / 7;
      const prevAvg = prev7.reduce((s, b) => s + b.systolic, 0) / 7;
      if (recentAvg > prevAvg + 5) trends.bp.trend = 'worsening';
      else if (recentAvg < prevAvg - 5) trends.bp.trend = 'improving';
    }
  }

  // Sugar Analysis
  const fastingSugar = context.recentSugar.filter(s => s.measurement_type === 'fasting');
  if (fastingSugar.length > 0) {
    trends.sugar.avgFasting = Math.round(
      fastingSugar.reduce((s, g) => s + g.glucose_mg_dl, 0) / fastingSugar.length
    );
    
    if (trends.sugar.avgFasting < 100) trends.sugar.status = 'optimal';
    else if (trends.sugar.avgFasting < 126) trends.sugar.status = 'prediabetic';
    else trends.sugar.status = 'diabetic_range';
  }

  // CGM Time in Range
  if (context.cgmData.length > 0) {
    const inRange = context.cgmData.filter(r => r.time_in_range).length;
    trends.sugar.timeInRange = Math.round((inRange / context.cgmData.length) * 100);
  }

  // Activity Analysis
  if (context.recentActivity.length > 0) {
    trends.activity.avgSteps = Math.round(
      context.recentActivity.reduce((s, a) => s + (a.steps_count || 0), 0) / context.recentActivity.length
    );
    trends.activity.avgCalories = Math.round(
      context.recentActivity.reduce((s, a) => s + (a.estimated_calories_burned || 0), 0) / context.recentActivity.length
    );
    trends.activity.activeMinutes = Math.round(
      context.recentActivity.reduce((s, a) => s + (a.duration_minutes || 0), 0) / context.recentActivity.length
    );
  }

  // Meal Analysis
  if (context.recentMeals.length > 0) {
    trends.meals.avgCalories = Math.round(
      context.recentMeals.reduce((s, m) => s + (m.estimated_calories || 0), 0) / context.recentMeals.length
    );
    trends.meals.avgCarbs = Math.round(
      context.recentMeals.reduce((s, m) => s + (m.estimated_carbs || 0), 0) / context.recentMeals.length
    );
    trends.meals.avgGL = Math.round(
      context.recentMeals.reduce((s, m) => s + (m.estimated_glycemic_load || 0), 0) / context.recentMeals.length
    );
  }

  return trends;
}

function trimForLog(value: string, maxLength = 1200): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [trimmed ${value.length - maxLength} chars]`;
}

function extractGeminiText(data: any): string {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text || "")
    .filter(Boolean)
    .join("") || "";
}

async function callGemini(params: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  const requestBody = {
    system_instruction: {
      parts: [{ text: params.systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: params.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2000,
    },
  };

  console.log("[reasoning-engine] Calling Gemini", {
    endpoint: GEMINI_ENDPOINT,
    model: "gemini-2.5-flash",
    contentsCount: requestBody.contents.length,
  });

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${params.apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("[reasoning-engine] Gemini response status", {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  });

  const responseText = await response.text();
  console.log("[reasoning-engine] Gemini response preview", {
    bodyPreview: trimForLog(responseText),
    bodyLength: responseText.length,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Gemini API unauthorized. Check GEMINI_API_KEY.");
    }
    if (response.status === 403) {
      throw new Error("Gemini API permission denied.");
    }
    if (response.status === 429) {
      throw new Error("Gemini quota exhausted.");
    }
    throw new Error(`Gemini API error: ${response.status}`);
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("[reasoning-engine] Invalid Gemini JSON response", {
      error,
      responsePreview: trimForLog(responseText),
    });
    throw new Error("Invalid Gemini response");
  }
}

async function performMultiConditionAnalysis(
  context: HealthContext,
  trends: any,
  geminiApiKey: string
): Promise<any> {
  const systemPrompt = `You are an advanced health AI analyzing a patient with multiple conditions.

PATIENT CONDITIONS: ${context.conditions.join(', ') || 'No diagnosed conditions'}

CURRENT MEDICATIONS:
${context.medications.map(m => `- ${m.name} ${m.dosage || ''} (${m.drug_class || 'unknown class'})`).join('\n') || 'None reported'}

VITAL TRENDS (30 days):
- BP: ${trends.bp.avgSystolic}/${trends.bp.avgDiastolic} mmHg (${trends.bp.status}, ${trends.bp.trend})
- Fasting Sugar: ${trends.sugar.avgFasting} mg/dL (${trends.sugar.status})
- CGM Time in Range: ${trends.sugar.timeInRange}%
- Daily Steps: ${trends.activity.avgSteps}
- Active Minutes: ${trends.activity.activeMinutes}/day

HEART SCORES (last 7 days):
${context.heartScores.slice(0, 7).map(s => `- ${s.score_date}: ${s.heart_score}/100`).join('\n') || 'No recent scores'}

CRITICAL MULTI-CONDITION CONSIDERATIONS:
1. Diabetes + Hypertension: BP target should be <130/80, ACE inhibitors/ARBs preferred
2. Heart Disease + Diabetes: Cardioprotective medications essential, avoid hypoglycemia
3. Obesity + Hypertension: Weight loss of 5-10% can reduce BP significantly
4. Multiple conditions increase cardiovascular risk exponentially

Analyze comprehensively and respond with JSON:
{
  "overallRiskLevel": "low|moderate|high|critical",
  "riskScores": {
    "cardiovascular": 0-100,
    "diabeticComplications": 0-100,
    "kidneyDisease": 0-100,
    "stroke": 0-100
  },
  "crossConditionImpacts": [
    {"impact": "description of how conditions interact", "severity": "high|moderate|low"}
  ],
  "prioritizedRecommendations": [
    {"priority": 1, "action": "specific recommendation", "expectedImpact": "what improvement to expect", "timeframe": "1-2 weeks"}
  ],
  "medicationConsiderations": [
    {"consideration": "medication advice", "urgency": "high|medium|low"}
  ],
  "lifestyleInterventions": [
    {"intervention": "specific lifestyle change", "targetMetric": "what to track", "goal": "specific goal"}
  ],
  "warningFlags": ["any urgent concerns"],
  "positiveFindings": ["what's going well"]
}`;

  try {
    console.log("[reasoning-engine] Gemini analysis request start", {
      conditions: context.conditions,
      bpStatus: trends.bp.status,
      sugarStatus: trends.sugar.status,
    });

    const aiResponse = await callGemini({
      apiKey: geminiApiKey,
      systemPrompt,
      userPrompt: 'Perform comprehensive multi-condition health analysis and provide actionable insights.',
    });

    const content = extractGeminiText(aiResponse);
    console.log("[reasoning-engine] Gemini parsing complete", {
      textPreview: trimForLog(content),
      textLength: content.length,
    });

    if (!content) {
      console.error("[reasoning-engine] Gemini response did not include text", aiResponse);
      throw new Error("Invalid Gemini response");
    }

    // Parse JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('AI analysis error:', error);
    // Return basic analysis without AI
    return {
      overallRiskLevel: trends.bp.status === 'high' || trends.sugar.status === 'diabetic_range' ? 'high' : 'moderate',
      riskScores: {
        cardiovascular: context.conditions.includes('heart_disease') ? 70 : 40,
        diabeticComplications: context.conditions.includes('diabetes') ? 60 : 20,
        kidneyDisease: 30,
        stroke: trends.bp.status === 'high' ? 50 : 25,
      },
      crossConditionImpacts: [],
      prioritizedRecommendations: [
        { priority: 1, action: 'Continue monitoring vitals daily', expectedImpact: 'Early detection of issues', timeframe: 'Ongoing' },
      ],
      medicationConsiderations: [],
      lifestyleInterventions: [],
      warningFlags: trends.bp.status === 'high' ? ['Blood pressure needs attention'] : [],
      positiveFindings: trends.bp.trend === 'improving' ? ['BP trend is improving'] : [],
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('[reasoning-engine] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth context to verify identity
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      console.error('[reasoning-engine] Invalid authentication:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('[reasoning-engine] GEMINI_API_KEY is not configured');
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Parse and validate input
    const body = await req.json();
    const validated = requestSchema.parse(body);
    const { userId, analysisType } = validated;

    // ========== AUTHORIZATION ==========
    // Allow if: user is analyzing themselves OR is authorized caregiver
    if (user.id !== userId) {
      const { data: familyLink, error: familyError } = await supabaseAuth
        .from('family_links')
        .select('can_view')
        .eq('member_id', userId)
        .eq('caregiver_id', user.id)
        .eq('can_view', true)
        .single();

      if (familyError || !familyLink) {
        console.error(`[reasoning-engine] User ${user.id} unauthorized to analyze ${userId}`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Not authorized for this user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`[reasoning-engine] Caregiver ${user.id} authorized to analyze ${userId}`);
    }

    console.log('[reasoning-engine] Request start', {
      analysisType,
      userId,
      authenticatedUserId: user.id,
      hasGeminiApiKey: !!GEMINI_API_KEY,
    });

    // Now safe to use service role for operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get comprehensive health context
    const context = await getHealthContext(supabase, userId);
    
    // Analyze trends
    const trends = analyzeVitalTrends(context);

    // Perform AI-powered multi-condition analysis
    const analysis = await performMultiConditionAnalysis(context, trends, GEMINI_API_KEY);

    // Save analysis to database
    await supabase.from('condition_analysis').insert({
      user_id: userId,
      analysis_date: new Date().toISOString().split('T')[0],
      conditions: context.conditions,
      risk_scores: analysis.riskScores,
      cross_impacts: {
        impacts: analysis.crossConditionImpacts,
        recommendations: analysis.prioritizedRecommendations,
      },
      recommendations: {
        lifestyle: analysis.lifestyleInterventions,
        medications: analysis.medicationConsiderations,
        warnings: analysis.warningFlags,
        positives: analysis.positiveFindings,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        conditions: context.conditions,
        trends,
        analysis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in reasoning-engine:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input',
          details: error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error.message || 'Analysis failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
