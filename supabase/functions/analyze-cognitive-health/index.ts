import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  console.log("[analyze-cognitive-health] Calling Gemini", {
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

  console.log("[analyze-cognitive-health] Gemini response status", {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  });

  const responseText = await response.text();
  console.log("[analyze-cognitive-health] Gemini response preview", {
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
    console.error("[analyze-cognitive-health] Invalid Gemini JSON response", {
      error,
      responsePreview: trimForLog(responseText),
    });
    throw new Error("Invalid Gemini response");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    // Create auth client to verify user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify JWT and get claims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Auth claims error:", claimsError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authenticatedUserId = claimsData.claims.sub;

    // Parse request body
    const { userId } = await req.json();

    console.log("[analyze-cognitive-health] Request start", {
      userId,
      authenticatedUserId,
      hasGeminiApiKey: !!GEMINI_API_KEY,
    });
    
    // Authorization check: user can only analyze their own data
    if (authenticatedUserId !== userId) {
      console.warn(`Unauthorized access attempt: ${authenticatedUserId} tried to access ${userId}`);
      return new Response(
        JSON.stringify({ error: "You can only analyze your own cognitive health data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing cognitive health for authenticated user: ${userId}`);

    // Use service role key for database operations (after authentication verified)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get cognitive assessments (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: assessments } = await supabase
      .from("cognitive_assessments")
      .select("*")
      .eq("user_id", userId)
      .gte("assessment_date", threeMonthsAgo.toISOString().split("T")[0])
      .order("assessment_date", { ascending: true });

    // Get cognitive patterns
    const { data: patterns } = await supabase
      .from("cognitive_patterns")
      .select("*")
      .eq("user_id", userId)
      .order("analyzed_at", { ascending: false })
      .limit(10);

    // Get user profile for context
    const { data: profile } = await supabase
      .from("profiles")
      .select("date_of_birth, has_diabetes, has_hypertension, has_heart_disease")
      .eq("id", userId)
      .single();

    // Calculate age
    let age = 0;
    if (profile?.date_of_birth) {
      const birthDate = new Date(profile.date_of_birth);
      age = Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    }

    // Analyze trends
    const analysis = {
      assessmentCount: assessments?.length || 0,
      averageScore: 0,
      trend: "stable" as "improving" | "stable" | "declining",
      concernLevel: "normal" as "normal" | "mild" | "moderate" | "consult_doctor",
      riskFactors: [] as string[],
      recommendations: [] as string[],
    };

    if (assessments && assessments.length > 0) {
      // Calculate average score as percentage
      const scores = assessments.map(a => (a.score / a.max_score) * 100);
      analysis.averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

      // Determine trend
      if (assessments.length >= 3) {
        const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
        const secondHalf = scores.slice(Math.floor(scores.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        if (secondAvg > firstAvg + 5) {
          analysis.trend = "improving";
        } else if (secondAvg < firstAvg - 10) {
          analysis.trend = "declining";
        }
      }

      // Determine concern level
      if (analysis.averageScore < 50) {
        analysis.concernLevel = "consult_doctor";
      } else if (analysis.averageScore < 65 || analysis.trend === "declining") {
        analysis.concernLevel = "moderate";
      } else if (analysis.averageScore < 75) {
        analysis.concernLevel = "mild";
      }
    }

    // Identify risk factors
    if (age >= 65) {
      analysis.riskFactors.push("Age over 65");
    }
    if (profile?.has_diabetes) {
      analysis.riskFactors.push("Diabetes (can affect cognitive function)");
    }
    if (profile?.has_hypertension) {
      analysis.riskFactors.push("Hypertension (can affect brain health)");
    }
    if (profile?.has_heart_disease) {
      analysis.riskFactors.push("Heart disease (reduced blood flow to brain)");
    }

    // Generate recommendations using AI if significant patterns exist
    if (assessments && assessments.length >= 3) {
      try {
        if (!GEMINI_API_KEY) {
          console.error("[analyze-cognitive-health] GEMINI_API_KEY is not configured");
          throw new Error("GEMINI_API_KEY not configured");
        }

        console.log("[analyze-cognitive-health] Gemini recommendation request start", {
          assessmentCount: analysis.assessmentCount,
          averageScore: analysis.averageScore,
          trend: analysis.trend,
          riskFactorCount: analysis.riskFactors.length,
        });

        const aiData = await callGemini({
          apiKey: GEMINI_API_KEY,
          systemPrompt: `You are a health AI assistant analyzing cognitive health patterns.
                Provide 3-4 brief, practical recommendations to support brain health.
                Focus on lifestyle factors like exercise, sleep, social engagement, and mental stimulation.
                Keep recommendations culturally appropriate for Indian seniors.
                Do NOT diagnose or suggest medication changes.`,
          userPrompt: `Cognitive assessment data:
                - Age: ${age}
                - Average score: ${analysis.averageScore}%
                - Trend: ${analysis.trend}
                - Risk factors: ${analysis.riskFactors.join(", ") || "None identified"}
                - Number of assessments: ${analysis.assessmentCount}
                
                Provide 3-4 specific recommendations for maintaining/improving cognitive health.`,
        });

        const recommendations = extractGeminiText(aiData);
        console.log("[analyze-cognitive-health] Gemini parsing complete", {
          textPreview: trimForLog(recommendations),
          textLength: recommendations.length,
        });

        if (!recommendations) {
          console.error("[analyze-cognitive-health] Gemini response did not include text", aiData);
          throw new Error("Invalid Gemini response");
        }

        if (recommendations) {
          // Parse recommendations into array
          analysis.recommendations = recommendations
            .split(/\d+\./)
            .filter((r: string) => r.trim())
            .map((r: string) => r.trim())
            .slice(0, 4);
        }
      } catch (aiError) {
        console.error("AI analysis error:", aiError);
      }
    }

    // Default recommendations if AI fails
    if (analysis.recommendations.length === 0) {
      analysis.recommendations = [
        "Daily 30-minute walks can improve brain blood flow",
        "Engage in social activities to maintain cognitive connections",
        "Try puzzles, reading, or learning new skills regularly",
        "Maintain consistent sleep schedule of 7-8 hours",
      ];
    }

    // Save analysis
    const { error: saveError } = await supabase
      .from("cognitive_patterns")
      .insert({
        user_id: userId,
        pattern_type: "comprehensive_analysis",
        current_value: analysis,
        deviation_percent: analysis.trend === "declining" ? -10 : analysis.trend === "improving" ? 10 : 0,
      });

    if (saveError) {
      console.error("Error saving analysis:", saveError);
    }

    // Alert family if concerning
    if (analysis.concernLevel === "consult_doctor" || analysis.concernLevel === "moderate") {
      // Check if family members should be notified
      const { data: familyLinks } = await supabase
        .from("family_links")
        .select("caregiver_id")
        .eq("member_id", userId)
        .eq("can_view", true);

      if (familyLinks && familyLinks.length > 0) {
        // Create nudge for family
        for (const link of familyLinks) {
          await supabase.rpc("create_ai_nudge", {
            target_user_id: link.caregiver_id,
            nudge_text: `Your family member's cognitive health check shows ${analysis.concernLevel === "consult_doctor" ? "concerning" : "slight"} changes. Consider checking in with them.`,
            category: "family_alert",
            delivered_via: "app",
          });
        }
      }
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-cognitive-health:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
