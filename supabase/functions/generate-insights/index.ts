import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
  };

  console.log("[generate-insights] Calling Gemini", {
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

  console.log("[generate-insights] Gemini response status", {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  });

  const responseText = await response.text();
  console.log("[generate-insights] Gemini response preview", {
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
    console.error("[generate-insights] Invalid Gemini JSON response", {
      error,
      responsePreview: trimForLog(responseText),
    });
    throw new Error("Invalid Gemini response");
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    console.log("[generate-insights] Request start");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error("[generate-insights] GEMINI_API_KEY is not configured");
      throw new Error("GEMINI_API_KEY not configured");
    }

    console.log("[generate-insights] Authenticated request", {
      userId: user.id,
      hasGeminiApiKey: !!GEMINI_API_KEY,
    });

    // Check rate limit (10 insight generations per hour)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdmin
      .rpc('check_rate_limit', {
        _user_id: user.id,
        _endpoint: 'generate-insights',
        _max_requests: 10,
        _window_seconds: 3600
      });

    if (rateLimitError) {
      console.error("Rate limit check failed:", rateLimitError);
    } else if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ error: "Too many insight requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch last 30 days of health data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    const [bpData, sugarData, behaviorData, heartScoreData] = await Promise.all([
      supabase.from('bp_logs').select('*').eq('user_id', user.id).gte('measured_at', thirtyDaysAgoStr).order('measured_at'),
      supabase.from('sugar_logs').select('*').eq('user_id', user.id).gte('measured_at', thirtyDaysAgoStr).order('measured_at'),
      supabase.from('behavior_logs').select('*').eq('user_id', user.id).gte('log_date', thirtyDaysAgo.toISOString().split('T')[0]).order('log_date'),
      supabase.from('heart_scores').select('*').eq('user_id', user.id).gte('score_date', thirtyDaysAgo.toISOString().split('T')[0]).order('score_date')
    ]);

    // Build data summary
    const bpLogs = bpData.data || [];
    const sugarLogs = sugarData.data || [];
    const behaviorLogs = behaviorData.data || [];
    const heartScores = heartScoreData.data || [];

    // Calculate averages and trends
    const avgSystolic = bpLogs.length > 0 ? (bpLogs.reduce((sum, log) => sum + log.systolic, 0) / bpLogs.length).toFixed(1) : 'N/A';
    const avgDiastolic = bpLogs.length > 0 ? (bpLogs.reduce((sum, log) => sum + log.diastolic, 0) / bpLogs.length).toFixed(1) : 'N/A';
    const avgSugar = sugarLogs.length > 0 ? (sugarLogs.reduce((sum, log) => sum + log.glucose_mg_dl, 0) / sugarLogs.length).toFixed(1) : 'N/A';
    const avgSleep = behaviorLogs.filter(l => l.sleep_hours).length > 0 
      ? (behaviorLogs.filter(l => l.sleep_hours).reduce((sum, log) => sum + (log.sleep_hours || 0), 0) / behaviorLogs.filter(l => l.sleep_hours).length).toFixed(1) 
      : 'N/A';
    const avgSteps = behaviorLogs.filter(l => l.steps_count).length > 0 
      ? Math.round(behaviorLogs.filter(l => l.steps_count).reduce((sum, log) => sum + (log.steps_count || 0), 0) / behaviorLogs.filter(l => l.steps_count).length)
      : 'N/A';
    const avgHeartScore = heartScores.length > 0 ? Math.round(heartScores.reduce((sum, s) => sum + s.heart_score, 0) / heartScores.length) : 'N/A';

    // Identify stress patterns
    const stressLevels = behaviorLogs.filter(l => l.stress_level).map(l => l.stress_level);
    const highStressDays = stressLevels.filter(s => s === 'high' || s === 'very_high').length;

    // Build context for AI
    const healthContext = `
User's 30-day health summary:
- Average BP: ${avgSystolic}/${avgDiastolic} mmHg (${bpLogs.length} readings)
- Average Blood Sugar: ${avgSugar} mg/dL (${sugarLogs.length} readings)
- Average Sleep: ${avgSleep} hours (${behaviorLogs.filter(l => l.sleep_hours).length} logs)
- Average Steps: ${avgSteps} (${behaviorLogs.filter(l => l.steps_count).length} logs)
- Average HeartScore: ${avgHeartScore}/100
- High stress days: ${highStressDays}/${stressLevels.length}
- Sleep quality distribution: ${JSON.stringify(behaviorLogs.filter(l => l.sleep_quality).reduce((acc, l) => {
  acc[l.sleep_quality!] = (acc[l.sleep_quality!] || 0) + 1;
  return acc;
}, {} as Record<string, number>))}

Recent trends (last 7 days):
- BP readings: ${bpLogs.slice(-7).map(l => `${l.systolic}/${l.diastolic}`).join(', ')}
- Sugar readings: ${sugarLogs.slice(-7).map(l => l.glucose_mg_dl).join(', ')} mg/dL
- Sleep hours: ${behaviorLogs.slice(-7).filter(l => l.sleep_hours).map(l => l.sleep_hours).join(', ')}
- Stress levels: ${behaviorLogs.slice(-7).filter(l => l.stress_level).map(l => l.stress_level).join(', ')}
`;

    const systemPrompt = `You are a medical-grade health insights analyst specializing in cardiovascular health, diabetes, and lifestyle optimization for Indian adults. 

Analyze the user's health data and provide:
1. **Key Correlations**: Identify patterns between BP, sugar, sleep, stress, and activity levels
2. **Personalized Trends**: Highlight improving or declining metrics
3. **Actionable Recommendations**: 3-5 specific, culturally relevant suggestions

Format your response in clear sections. Be warm, supportive, and specific. Focus on practical lifestyle changes aligned with Indian dietary and cultural practices.

CRITICAL SAFETY RULES:
- NEVER diagnose medical conditions
- If BP ≥140/90 or sugar ≥126 (fasting) consistently, recommend consulting a doctor
- Keep recommendations under 300 words total`;

    console.log("[generate-insights] Gemini insight request start", {
      bpReadings: bpLogs.length,
      sugarReadings: sugarLogs.length,
      behaviorLogs: behaviorLogs.length,
      heartScores: heartScores.length,
    });

    const aiData = await callGemini({
      apiKey: GEMINI_API_KEY,
      systemPrompt,
      userPrompt: `Analyze this health data and provide insights:\n\n${healthContext}`,
    });

    const insights = extractGeminiText(aiData);
    console.log("[generate-insights] Gemini parsing complete", {
      textPreview: trimForLog(insights),
      textLength: insights.length,
    });

    if (!insights) {
      console.error("[generate-insights] Gemini response did not include text", aiData);
      throw new Error("Invalid Gemini response");
    }

    // Calculate correlations
    const correlations = {
      sleepAndBP: calculateCorrelation(
        behaviorLogs.filter(l => l.sleep_hours).map(l => l.sleep_hours!),
        bpLogs.map(l => l.systolic)
      ),
      stressAndBP: calculateCorrelation(
        behaviorLogs.filter(l => l.stress_level).map(l => stressLevelToNumber(l.stress_level!)),
        bpLogs.map(l => l.systolic)
      ),
      sleepAndSugar: calculateCorrelation(
        behaviorLogs.filter(l => l.sleep_hours).map(l => l.sleep_hours!),
        sugarLogs.map(l => l.glucose_mg_dl)
      ),
      stepsAndHeartScore: calculateCorrelation(
        behaviorLogs.filter(l => l.steps_count).map(l => l.steps_count!),
        heartScores.map(s => s.heart_score)
      )
    };

    return new Response(JSON.stringify({ 
      insights,
      correlations,
      summary: {
        avgSystolic,
        avgDiastolic,
        avgSugar,
        avgSleep,
        avgSteps,
        avgHeartScore,
        dataPoints: {
          bp: bpLogs.length,
          sugar: sugarLogs.length,
          sleep: behaviorLogs.filter(l => l.sleep_hours).length,
          stress: stressLevels.length
        }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating insights:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function stressLevelToNumber(level: string): number {
  const map: Record<string, number> = { 'low': 1, 'moderate': 2, 'high': 3, 'very_high': 4 };
  return map[level] || 2;
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length === 0 || y.length === 0 || x.length !== y.length) return 0;
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}
