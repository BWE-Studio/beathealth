import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const scoreSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

interface BPLog {
  systolic: number;
  diastolic: number;
  measured_at: string;
}

interface SugarLog {
  glucose_mg_dl: number;
  measurement_type: string;
  measured_at: string;
}

interface BehaviorLog {
  log_date: string;
  meds_taken: boolean;
  ritual_type: string;
  mood_score?: number;
  sleep_quality?: string;
  social_interaction_count?: number;
  loneliness_score?: number;
}

interface SocialWellnessLog {
  social_interactions: number;
  loneliness_score: number;
  left_home: boolean;
  mood_score: number;
}

interface EnvironmentalLog {
  aqi: number;
  temperature_celsius: number;
}

interface CognitiveAssessment {
  score: number;
  max_score: number;
  risk_level: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();
    const validated = scoreSchema.parse(body);
    const { date } = validated;
    const targetDate = date || new Date().toISOString().split("T")[0];

    console.log("[HeartScore] Request start", {
      userId: user.id,
      targetDate,
      hasGeminiApiKey: !!geminiApiKey,
      adminKeyRole: getJwtRole(supabaseServiceKey),
    });

    // Check rate limit
    const { data: rateLimitOk, error: rateLimitError } = await supabaseAdmin
      .rpc('check_rate_limit', {
        _user_id: user.id,
        _endpoint: 'calculate-heart-score',
        _max_requests: 10,
        _window_seconds: 3600
      });

    if (rateLimitError) {
      console.error("Rate limit check failed:", rateLimitError);
    } else if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ error: "Too many HeartScore calculations. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all health data in parallel
    const [bpResult, sugarResult, behaviorResult, socialResult, envResult, cognitiveResult] = await Promise.all([
      // BP logs
      supabaseAdmin
        .from("bp_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("measured_at", `${targetDate}T00:00:00`)
        .lt("measured_at", `${targetDate}T23:59:59`)
        .order("measured_at", { ascending: false }),
      
      // Sugar logs
      supabaseAdmin
        .from("sugar_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("measured_at", `${targetDate}T00:00:00`)
        .lt("measured_at", `${targetDate}T23:59:59`)
        .order("measured_at", { ascending: false }),
      
      // Behavior logs
      supabaseAdmin
        .from("behavior_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("log_date", targetDate),
      
      // Social wellness logs
      supabaseAdmin
        .from("social_wellness_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("log_date", targetDate)
        .maybeSingle(),
      
      // Environmental logs (most recent)
      supabaseAdmin
        .from("environmental_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("measured_at", `${targetDate}T00:00:00`)
        .order("measured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      
      // Cognitive assessments (last 7 days for trend)
      supabaseAdmin
        .from("cognitive_assessments")
        .select("*")
        .eq("user_id", user.id)
        .gte("assessment_date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
        .order("assessment_date", { ascending: false })
        .limit(3),
    ]);

    const bpLogs = bpResult.data || [];
    const sugarLogs = sugarResult.data || [];
    const behaviorLogs = behaviorResult.data || [];
    const socialLog = socialResult.data as SocialWellnessLog | null;
    const envLog = envResult.data as EnvironmentalLog | null;
    const cognitiveAssessments = cognitiveResult.data || [];

    // Calculate BP Score (0-100) - 25% weight
    let bpScore = 50;
    if (bpLogs.length > 0) {
      const avgSystolic = bpLogs.reduce((sum: number, log: BPLog) => sum + log.systolic, 0) / bpLogs.length;
      const avgDiastolic = bpLogs.reduce((sum: number, log: BPLog) => sum + log.diastolic, 0) / bpLogs.length;

      if (avgSystolic < 120 && avgDiastolic < 80) {
        bpScore = 100;
      } else if (avgSystolic < 130 && avgDiastolic < 80) {
        bpScore = 90;
      } else if (avgSystolic < 140 || avgDiastolic < 90) {
        bpScore = 70;
      } else if (avgSystolic < 160 || avgDiastolic < 100) {
        bpScore = 50;
      } else {
        bpScore = 30;
      }
    }

    // Calculate Sugar Score (0-100) - 25% weight
    let sugarScore = 50;
    if (sugarLogs.length > 0) {
      const fastingLogs = sugarLogs.filter((log: SugarLog) => log.measurement_type === "fasting");
      const randomLogs = sugarLogs.filter((log: SugarLog) => log.measurement_type === "random");

      let fastingScore = 50;
      let randomScore = 50;

      if (fastingLogs.length > 0) {
        const avgFasting = fastingLogs.reduce((sum: number, log: SugarLog) => sum + log.glucose_mg_dl, 0) / fastingLogs.length;
        if (avgFasting < 100) fastingScore = 100;
        else if (avgFasting < 126) fastingScore = 70;
        else fastingScore = 40;
      }

      if (randomLogs.length > 0) {
        const avgRandom = randomLogs.reduce((sum: number, log: SugarLog) => sum + log.glucose_mg_dl, 0) / randomLogs.length;
        if (avgRandom < 140) randomScore = 100;
        else if (avgRandom < 200) randomScore = 70;
        else randomScore = 40;
      }

      sugarScore = Math.round((fastingScore + randomScore) / 2);
    }

    // Calculate Consistency/Behavior Score (0-100) - 20% weight
    let consistencyScore = 0;
    if (behaviorLogs.length > 0) {
      const morningRitual = behaviorLogs.find((log: BehaviorLog) => log.ritual_type === "morning");
      const eveningRitual = behaviorLogs.find((log: BehaviorLog) => log.ritual_type === "evening");

      if (morningRitual) consistencyScore += 40;
      if (eveningRitual) consistencyScore += 40;

      // Medication adherence bonus
      const medsTaken = behaviorLogs.filter((log: BehaviorLog) => log.meds_taken).length;
      if (medsTaken === behaviorLogs.length && behaviorLogs.length > 0) {
        consistencyScore = Math.min(100, consistencyScore + 20);
      }

      // Sleep quality bonus
      const goodSleep = behaviorLogs.some((log: BehaviorLog) => 
        log.sleep_quality === "excellent" || log.sleep_quality === "good"
      );
      if (goodSleep) {
        consistencyScore = Math.min(100, consistencyScore + 10);
      }
    }

    // Calculate Social Wellness Score (0-100) - 15% weight
    let socialScore = 50;
    if (socialLog) {
      let score = 0;
      
      // Social interactions (0-3+ = 0-40 points)
      score += Math.min(40, (socialLog.social_interactions || 0) * 15);
      
      // Left home (20 points)
      if (socialLog.left_home) score += 20;
      
      // Mood score (1-5 = 20-40 points)
      if (socialLog.mood_score) {
        score += Math.min(40, socialLog.mood_score * 8);
      }
      
      // Loneliness penalty (high loneliness reduces score)
      if (socialLog.loneliness_score && socialLog.loneliness_score > 3) {
        score = Math.max(0, score - (socialLog.loneliness_score - 3) * 15);
      }
      
      socialScore = Math.min(100, score);
    } else if (behaviorLogs.some((log: BehaviorLog) => log.social_interaction_count)) {
      // Fallback to behavior log social data
      const socialInteractions = behaviorLogs.reduce((sum, log: BehaviorLog) => 
        sum + (log.social_interaction_count || 0), 0
      );
      socialScore = Math.min(100, 50 + socialInteractions * 15);
    }

    // Calculate Environmental Factor (0-100) - 10% weight
    let envScore = 70; // Default neutral
    if (envLog) {
      // AQI impact (lower is better)
      if (envLog.aqi <= 50) envScore = 100;
      else if (envLog.aqi <= 100) envScore = 80;
      else if (envLog.aqi <= 150) envScore = 60;
      else if (envLog.aqi <= 200) envScore = 40;
      else envScore = 20;
      
      // Temperature comfort bonus/penalty
      if (envLog.temperature_celsius) {
        const temp = envLog.temperature_celsius;
        if (temp >= 20 && temp <= 28) envScore = Math.min(100, envScore + 10);
        else if (temp < 15 || temp > 35) envScore = Math.max(0, envScore - 10);
      }
    }

    // Calculate Cognitive Score (0-100) - 5% weight
    let cognitiveScore = 80; // Default healthy
    if (cognitiveAssessments.length > 0) {
      const latestAssessment = cognitiveAssessments[0] as CognitiveAssessment;
      const percentScore = (latestAssessment.score / latestAssessment.max_score) * 100;
      
      if (latestAssessment.risk_level === "normal") cognitiveScore = 100;
      else if (latestAssessment.risk_level === "mild_concern") cognitiveScore = 70;
      else if (latestAssessment.risk_level === "moderate_concern") cognitiveScore = 50;
      else cognitiveScore = Math.max(30, percentScore);
    }

    // Calculate final HeartScore with new weights
    // BP: 25%, Sugar: 25%, Consistency: 20%, Social: 15%, Environment: 10%, Cognitive: 5%
    const heartScore = Math.round(
      (bpScore * 0.25) + 
      (sugarScore * 0.25) + 
      (consistencyScore * 0.20) + 
      (socialScore * 0.15) + 
      (envScore * 0.10) + 
      (cognitiveScore * 0.05)
    );

    console.log(`Scores: BP=${bpScore}, Sugar=${sugarScore}, Consistency=${consistencyScore}, Social=${socialScore}, Env=${envScore}, Cognitive=${cognitiveScore}, Heart=${heartScore}`);

    // Generate comprehensive AI explanation
    const aiPrompt = `You are a health coach explaining a HeartScore to an Indian adult. The HeartScore is ${heartScore}/100.

Component scores:
- Blood Pressure: ${bpScore}/100 ${bpLogs.length > 0 ? `(Avg: ${Math.round(bpLogs.reduce((s: number, l: BPLog) => s + l.systolic, 0) / bpLogs.length)}/${Math.round(bpLogs.reduce((s: number, l: BPLog) => s + l.diastolic, 0) / bpLogs.length)} mmHg)` : '(No readings today)'}
- Blood Sugar: ${sugarScore}/100 ${sugarLogs.length > 0 ? `(Avg: ${Math.round(sugarLogs.reduce((s: number, l: SugarLog) => s + l.glucose_mg_dl, 0) / sugarLogs.length)} mg/dL)` : '(No readings today)'}
- Daily Rituals: ${consistencyScore}/100 (${behaviorLogs.length} check-ins done)
- Social Wellness: ${socialScore}/100 ${socialLog ? `(${socialLog.social_interactions || 0} interactions${socialLog.left_home ? ', went outside' : ''})` : ''}
- Environment: ${envScore}/100 ${envLog ? `(AQI: ${envLog.aqi})` : ''}
- Cognitive Health: ${cognitiveScore}/100

Write a warm, encouraging 2-3 sentence summary in simple English. Highlight the biggest positive and one area to improve. Be specific and actionable. Keep it conversational.`;

    let aiExplanation = "Your HeartScore reflects your overall health today. Keep logging your daily rituals!";

    try {
      if (!geminiApiKey) {
        console.error("[HeartScore] GEMINI_API_KEY is not configured. Using fallback explanation.");
        throw new Error("GEMINI_API_KEY not configured");
      }

      const requestBody = {
        system_instruction: {
          parts: [{ text: "You are a supportive health coach for Indian adults managing BP, diabetes, and heart health." }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: aiPrompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7,
        },
      };

      console.log("[HeartScore] Calling Gemini API", {
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        model: "gemini-2.5-flash",
        heartScore,
      });

      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("[HeartScore] Gemini status", {
        ok: aiResponse.ok,
        status: aiResponse.status,
        statusText: aiResponse.statusText,
      });

      const responseText = await aiResponse.text();
      console.log("[HeartScore] Gemini response preview", {
        bodyPreview: trimForLog(responseText),
        bodyLength: responseText.length,
      });

      if (aiResponse.ok) {
        let aiData: any;
        try {
          aiData = JSON.parse(responseText);
        } catch (parseError) {
          console.error("[HeartScore] Invalid Gemini JSON response:", {
            parseError,
            responsePreview: trimForLog(responseText),
          });
          throw new Error("Invalid Gemini response");
        }

        const explanation = extractGeminiText(aiData);
        if (!explanation) {
          console.error("[HeartScore] Gemini response did not include text content", {
            aiData,
          });
          throw new Error("Invalid Gemini response");
        }

        aiExplanation = explanation;
        console.log("[HeartScore] Parsed explanation", {
          explanationPreview: trimForLog(aiExplanation),
          explanationLength: aiExplanation.length,
        });
      } else {
        console.error("[HeartScore] Gemini explanation failed:", {
          status: aiResponse.status,
          statusText: aiResponse.statusText,
          errorText: trimForLog(responseText),
        });

        if (aiResponse.status === 401) {
          throw new Error("Gemini API unauthorized. Check GEMINI_API_KEY.");
        }
        if (aiResponse.status === 403) {
          throw new Error("Gemini API permission denied.");
        }
        if (aiResponse.status === 429) {
          throw new Error("Gemini quota exhausted.");
        }

        throw new Error(`Gemini API error: ${aiResponse.status}`);
      }
    } catch (aiError) {
      console.error("[HeartScore] Error generating AI explanation:", aiError);
    }

    // Store the HeartScore
    const { data: heartScoreData, error: insertError } = await supabaseAdmin
      .from("heart_scores")
      .upsert({
        user_id: user.id,
        score_date: targetDate,
        heart_score: heartScore,
        bp_score: bpScore,
        sugar_score: sugarScore,
        consistency_score: consistencyScore,
        ai_explanation: aiExplanation,
      }, {
        onConflict: "user_id,score_date"
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log("[HeartScore] HeartScore saved successfully:", heartScoreData);

    // Generate health alerts based on readings
    const alertsToCreate: any[] = [];

    // BP Alerts
    if (bpLogs.length > 0) {
      const latestBP = bpLogs[0];
      if (latestBP.systolic >= 160 || latestBP.diastolic >= 100) {
        alertsToCreate.push({
          user_id: user.id,
          alert_type: "high_bp",
          message: `Your BP reading of ${latestBP.systolic}/${latestBP.diastolic} mmHg is high. Consider resting and rechecking. Consult your doctor if this persists.`,
          severity: "high",
          related_date: targetDate,
        });
      } else if (latestBP.systolic < 90 || latestBP.diastolic < 60) {
        alertsToCreate.push({
          user_id: user.id,
          alert_type: "low_bp",
          message: `Your BP reading of ${latestBP.systolic}/${latestBP.diastolic} mmHg is lower than normal. Stay hydrated and consult your doctor if you feel dizzy.`,
          severity: "high",
          related_date: targetDate,
        });
      }
    }

    // Sugar Alerts
    if (sugarLogs.length > 0) {
      const latestSugar = sugarLogs[0];
      if (latestSugar.glucose_mg_dl >= 180) {
        alertsToCreate.push({
          user_id: user.id,
          alert_type: "high_sugar",
          message: `Your blood sugar of ${latestSugar.glucose_mg_dl} mg/dL is elevated. Review your recent meals and medication timing.`,
          severity: "high",
          related_date: targetDate,
        });
      } else if (latestSugar.glucose_mg_dl < 70) {
        alertsToCreate.push({
          user_id: user.id,
          alert_type: "low_sugar",
          message: `Your blood sugar of ${latestSugar.glucose_mg_dl} mg/dL is low. Have a snack with fast-acting carbs immediately.`,
          severity: "high",
          related_date: targetDate,
        });
      }
    }

    // Insert alerts if any
    if (alertsToCreate.length > 0) {
      const { error: alertError } = await supabaseAdmin
        .from("health_alerts")
        .insert(alertsToCreate);
      
      if (alertError) {
        console.error("Error creating alerts:", alertError);
      } else {
        console.log(`Created ${alertsToCreate.length} health alert(s)`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        heartScore: heartScoreData,
        breakdown: {
          bp: bpScore,
          sugar: sugarScore,
          consistency: consistencyScore,
          social: socialScore,
          environment: envScore,
          cognitive: cognitiveScore,
        },
        message: "HeartScore calculated successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error calculating HeartScore:", error);
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid input",
          details: error.errors
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

function extractGeminiText(response: any): string {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => part?.text)
    .filter((text) => typeof text === "string")
    .join("\n")
    .trim();
}

function trimForLog(value: string, maxLength = 4000): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [trimmed ${value.length - maxLength} chars]`;
}

function getJwtRole(jwt: string): string {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return "unknown";

    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof decoded.role === "string" ? decoded.role : "unknown";
  } catch {
    return "unknown";
  }
}
