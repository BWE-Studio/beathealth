import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(2000)
  })).min(1).max(50),
  language: z.enum(['en', 'hi']).optional().default('en')
});

// Agent function definitions for tool calling
const agentTools = [
  {
    type: "function",
    function: {
      name: "get_health_summary",
      description: "Get user's current health status including latest BP, sugar, HeartScore, and streak",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Optional date in YYYY-MM-DD format" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_bp_history",
      description: "Fetch blood pressure readings for a date range",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date in YYYY-MM-DD format" },
          end_date: { type: "string", description: "End date in YYYY-MM-DD format" },
          limit: { type: "number", description: "Max number of readings to return" }
        },
        required: ["start_date", "end_date"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sugar_history",
      description: "Fetch blood sugar readings for a date range",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date in YYYY-MM-DD format" },
          end_date: { type: "string", description: "End date in YYYY-MM-DD format" },
          measurement_type: { type: "string", enum: ["fasting", "random", "post_meal"], description: "Filter by measurement type" }
        },
        required: ["start_date", "end_date"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_goals",
      description: "Get user's active health goals and progress",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "completed", "abandoned"], description: "Filter by goal status" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "suggest_log_bp",
      description: "Suggest logging a blood pressure reading. Use when user mentions their BP numbers.",
      parameters: {
        type: "object",
        properties: {
          systolic: { type: "number", description: "Systolic pressure (60-250)" },
          diastolic: { type: "number", description: "Diastolic pressure (40-150)" },
          heart_rate: { type: "number", description: "Heart rate if mentioned (30-200)" },
          ritual_type: { type: "string", enum: ["morning", "evening"] }
        },
        required: ["systolic", "diastolic"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_log_sugar",
      description: "Suggest logging a blood sugar reading. Use when user mentions their sugar/glucose numbers.",
      parameters: {
        type: "object",
        properties: {
          glucose_mg_dl: { type: "number", description: "Blood glucose in mg/dL (20-600)" },
          measurement_type: { type: "string", enum: ["fasting", "random", "post_meal"] }
        },
        required: ["glucose_mg_dl", "measurement_type"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_set_goal",
      description: "Suggest setting a health goal when user expresses intent to improve a metric",
      parameters: {
        type: "object",
        properties: {
          goal_type: { type: "string", enum: ["bp_systolic", "bp_diastolic", "sugar_fasting", "steps", "weight", "sleep"] },
          target_value: { type: "number", description: "Target value for the goal" },
          reasoning: { type: "string", description: "Why this goal is recommended" }
        },
        required: ["goal_type", "target_value", "reasoning"],
        additionalProperties: false
      }
    }
  },
  // L2 Agent Control Tools
  {
    type: "function",
    function: {
      name: "get_agent_status",
      description: "Get the current status of the user's AI agent including autonomy level and recent actions",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_agent_autonomy",
      description: "Update the agent's autonomy level based on user request. Use when user says things like 'be more proactive' or 'stop auto actions'",
      parameters: {
        type: "object",
        properties: {
          autonomy_level: { type: "string", enum: ["minimal", "balanced", "full"], description: "New autonomy level" },
          reason: { type: "string", description: "Why the change was requested" }
        },
        required: ["autonomy_level"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_agent_actions",
      description: "Get recent agent actions to answer questions like 'what have you done?' or 'show me your activity'",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max actions to return (default 10)" }
        },
        additionalProperties: false
      }
    }
  }
];

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

type ChatMessage = z.infer<typeof chatSchema>["messages"][number];

function trimForLog(value: string, maxLength = 1200): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [trimmed ${value.length - maxLength} chars]`;
}

function convertMessagesToGeminiContents(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{
      text: message.role === "system"
        ? `System note: ${message.content}`
        : message.content,
    }],
  }));
}

function convertSchemaToGemini(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;

  const { additionalProperties: _additionalProperties, properties, items, ...rest } = schema;
  const converted: any = { ...rest };

  if (properties) {
    converted.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, convertSchemaToGemini(value)])
    );
  }

  if (items) {
    converted.items = convertSchemaToGemini(items);
  }

  return converted;
}

function convertToolsToGeminiDeclarations(tools: typeof agentTools) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: convertSchemaToGemini(tool.function.parameters),
  }));
}

function extractGeminiText(data: any): string {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text || "")
    .filter(Boolean)
    .join("") || "";
}

function extractGeminiFunctionCalls(data: any) {
  return data?.candidates?.[0]?.content?.parts
    ?.filter((part: any) => part.functionCall)
    .map((part: any, index: number) => ({
      id: `gemini-tool-call-${index}`,
      name: part.functionCall.name,
      args: part.functionCall.args || {},
    })) || [];
}

function createSseResponse(content: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        choices: [{ delta: { content } }],
      })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

async function callGemini(params: {
  apiKey: string;
  systemPrompt: string;
  contents: any[];
  includeTools?: boolean;
  logContext: string;
}) {
  const requestBody: any = {
    system_instruction: {
      parts: [{ text: params.systemPrompt }],
    },
    contents: params.contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
  };

  if (params.includeTools) {
    requestBody.tools = [{
      function_declarations: convertToolsToGeminiDeclarations(agentTools),
    }];
    requestBody.tool_config = {
      function_calling_config: {
        mode: "auto",
      },
    };
  }

  console.log("[ChatCopilot] Calling Gemini", {
    endpoint: GEMINI_ENDPOINT,
    model: "gemini-2.5-flash",
    logContext: params.logContext,
    includeTools: !!params.includeTools,
    contentsCount: params.contents.length,
  });

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${params.apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("[ChatCopilot] Gemini response received", {
    logContext: params.logContext,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  });

  const responseText = await response.text();
  console.log("[ChatCopilot] Gemini response preview", {
    logContext: params.logContext,
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
    console.error("[ChatCopilot] Invalid Gemini JSON response", {
      logContext: params.logContext,
      error,
      responsePreview: trimForLog(responseText),
    });
    throw new Error("Invalid Gemini response");
  }
}

// Function to fetch user health data context
async function getUserHealthContext(supabase: any, userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  try {
    const [profileRes, bpRes, sugarRes, heartScoreRes, streakRes, goalsRes] = await Promise.all([
      supabase.from("profiles").select("full_name, has_diabetes, has_hypertension, has_heart_disease, weight_kg, height_cm, date_of_birth, gender").eq("id", userId).single(),
      supabase.from("bp_logs").select("systolic, diastolic, heart_rate, measured_at").eq("user_id", userId).gte("measured_at", `${sevenDaysAgoStr}T00:00:00`).order("measured_at", { ascending: false }).limit(10),
      supabase.from("sugar_logs").select("glucose_mg_dl, measurement_type, measured_at").eq("user_id", userId).gte("measured_at", `${sevenDaysAgoStr}T00:00:00`).order("measured_at", { ascending: false }).limit(10),
      supabase.from("heart_scores").select("heart_score, bp_score, sugar_score, consistency_score, ai_explanation, score_date").eq("user_id", userId).order("score_date", { ascending: false }).limit(7),
      supabase.from("streaks").select("type, count, last_logged_at").eq("user_id", userId),
      supabase.from("health_goals").select("goal_type, target_value, current_value, status").eq("user_id", userId).eq("status", "active")
    ]);

    const profile = profileRes.data;
    const bpLogs = bpRes.data || [];
    const sugarLogs = sugarRes.data || [];
    const heartScores = heartScoreRes.data || [];
    const streaks = streakRes.data || [];
    const goals = goalsRes.data || [];

    // Calculate averages
    const avgBP = bpLogs.length > 0 ? {
      systolic: Math.round(bpLogs.reduce((sum: number, l: any) => sum + l.systolic, 0) / bpLogs.length),
      diastolic: Math.round(bpLogs.reduce((sum: number, l: any) => sum + l.diastolic, 0) / bpLogs.length)
    } : null;

    const avgSugar = sugarLogs.length > 0 ? 
      Math.round(sugarLogs.reduce((sum: number, l: any) => sum + l.glucose_mg_dl, 0) / sugarLogs.length) : null;

    const latestHeartScore = heartScores[0];
    const mainStreak = streaks.find((s: any) => s.type === 'daily_checkin');

    // Build context string
    let context = "USER HEALTH CONTEXT (Use this data to provide personalized, accurate advice):\n\n";

    if (profile) {
      context += `PROFILE:\n`;
      if (profile.full_name) context += `- Name: ${profile.full_name}\n`;
      if (profile.gender) context += `- Gender: ${profile.gender}\n`;
      if (profile.date_of_birth) {
        const age = Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        context += `- Age: ${age} years\n`;
      }
      if (profile.weight_kg) context += `- Weight: ${profile.weight_kg} kg\n`;
      if (profile.height_cm) context += `- Height: ${profile.height_cm} cm\n`;
      context += `- Has Hypertension: ${profile.has_hypertension ? 'Yes' : 'No'}\n`;
      context += `- Has Diabetes: ${profile.has_diabetes ? 'Yes' : 'No'}\n`;
      context += `- Has Heart Disease: ${profile.has_heart_disease ? 'Yes' : 'No'}\n\n`;
    }

    if (latestHeartScore) {
      context += `CURRENT HEARTSCORE (as of ${latestHeartScore.score_date}):\n`;
      context += `- Overall Score: ${latestHeartScore.heart_score}/100\n`;
      if (latestHeartScore.bp_score) context += `- BP Score: ${latestHeartScore.bp_score}/100\n`;
      if (latestHeartScore.sugar_score) context += `- Sugar Score: ${latestHeartScore.sugar_score}/100\n`;
      if (latestHeartScore.consistency_score) context += `- Consistency Score: ${latestHeartScore.consistency_score}/100\n`;
      if (latestHeartScore.ai_explanation) context += `- Analysis: ${latestHeartScore.ai_explanation}\n\n`;
    }

    if (bpLogs.length > 0) {
      const latestBP = bpLogs[0];
      context += `BLOOD PRESSURE (Last 7 days, ${bpLogs.length} readings):\n`;
      context += `- Latest: ${latestBP.systolic}/${latestBP.diastolic} mmHg`;
      if (latestBP.heart_rate) context += `, HR: ${latestBP.heart_rate} bpm`;
      context += `\n`;
      if (avgBP) context += `- 7-day Average: ${avgBP.systolic}/${avgBP.diastolic} mmHg\n`;
      
      // Classify BP
      if (avgBP) {
        let bpStatus = "Normal";
        if (avgBP.systolic >= 180 || avgBP.diastolic >= 120) bpStatus = "HYPERTENSIVE CRISIS - URGENT";
        else if (avgBP.systolic >= 140 || avgBP.diastolic >= 90) bpStatus = "High (Stage 2 Hypertension)";
        else if (avgBP.systolic >= 130 || avgBP.diastolic >= 80) bpStatus = "Elevated (Stage 1 Hypertension)";
        else if (avgBP.systolic < 90 || avgBP.diastolic < 60) bpStatus = "Low";
        context += `- Status: ${bpStatus}\n\n`;
      }
    }

    if (sugarLogs.length > 0) {
      const latestSugar = sugarLogs[0];
      const fastingLogs = sugarLogs.filter((l: any) => l.measurement_type === 'fasting');
      const avgFasting = fastingLogs.length > 0 ? 
        Math.round(fastingLogs.reduce((sum: number, l: any) => sum + l.glucose_mg_dl, 0) / fastingLogs.length) : null;

      context += `BLOOD SUGAR (Last 7 days, ${sugarLogs.length} readings):\n`;
      context += `- Latest: ${latestSugar.glucose_mg_dl} mg/dL (${latestSugar.measurement_type})\n`;
      if (avgSugar) context += `- Overall Average: ${avgSugar} mg/dL\n`;
      if (avgFasting) context += `- Fasting Average: ${avgFasting} mg/dL\n`;
      
      // Classify sugar
      if (avgFasting) {
        let sugarStatus = "Normal";
        if (avgFasting >= 126) sugarStatus = "Diabetic Range";
        else if (avgFasting >= 100) sugarStatus = "Pre-diabetic";
        context += `- Fasting Status: ${sugarStatus}\n\n`;
      }
    }

    if (mainStreak) {
      context += `CONSISTENCY:\n- Current Streak: ${mainStreak.count} days\n\n`;
    }

    if (goals.length > 0) {
      context += `ACTIVE HEALTH GOALS:\n`;
      goals.forEach((g: any) => {
        context += `- ${g.goal_type}: Target ${g.target_value}, Current ${g.current_value || 'Not set'}\n`;
      });
      context += `\n`;
    }

    return context;
  } catch (error) {
    console.error("Error fetching health context:", error);
    return "";
  }
}

// Execute agent function and return result
async function executeAgentFunction(supabase: any, userId: string, functionName: string, args: any): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  switch (functionName) {
    case 'get_health_summary': {
      const [heartScoreRes, bpRes, sugarRes, streakRes] = await Promise.all([
        supabase.from('heart_scores').select('*').eq('user_id', userId).order('score_date', { ascending: false }).limit(1),
        supabase.from('bp_logs').select('*').eq('user_id', userId).order('measured_at', { ascending: false }).limit(1),
        supabase.from('sugar_logs').select('*').eq('user_id', userId).order('measured_at', { ascending: false }).limit(1),
        supabase.from('streaks').select('*').eq('user_id', userId).eq('type', 'daily_checkin'),
      ]);
      
      return JSON.stringify({
        heart_score: heartScoreRes.data?.[0]?.heart_score || null,
        latest_bp: bpRes.data?.[0] ? `${bpRes.data[0].systolic}/${bpRes.data[0].diastolic}` : null,
        latest_sugar: sugarRes.data?.[0]?.glucose_mg_dl || null,
        streak_days: streakRes.data?.[0]?.count || 0,
      });
    }
    
    case 'get_bp_history': {
      const startDate = args.start_date || thirtyDaysAgoStr;
      const endDate = args.end_date || today;
      const { data } = await supabase
        .from('bp_logs')
        .select('systolic, diastolic, heart_rate, measured_at')
        .eq('user_id', userId)
        .gte('measured_at', `${startDate}T00:00:00`)
        .lte('measured_at', `${endDate}T23:59:59`)
        .order('measured_at', { ascending: false })
        .limit(args.limit || 10);
      
      const readings = data || [];
      const avg = readings.length > 0 ? {
        systolic: Math.round(readings.reduce((s: number, r: any) => s + r.systolic, 0) / readings.length),
        diastolic: Math.round(readings.reduce((s: number, r: any) => s + r.diastolic, 0) / readings.length),
      } : null;
      
      return JSON.stringify({ readings_count: readings.length, average: avg, recent: readings.slice(0, 3) });
    }
    
    case 'get_sugar_history': {
      const startDate = args.start_date || thirtyDaysAgoStr;
      const endDate = args.end_date || today;
      let query = supabase
        .from('sugar_logs')
        .select('glucose_mg_dl, measurement_type, measured_at')
        .eq('user_id', userId)
        .gte('measured_at', `${startDate}T00:00:00`)
        .lte('measured_at', `${endDate}T23:59:59`)
        .order('measured_at', { ascending: false })
        .limit(10);
      
      if (args.measurement_type) {
        query = query.eq('measurement_type', args.measurement_type);
      }
      
      const { data } = await query;
      const readings = data || [];
      const avg = readings.length > 0 
        ? Math.round(readings.reduce((s: number, r: any) => s + r.glucose_mg_dl, 0) / readings.length)
        : null;
      
      return JSON.stringify({ readings_count: readings.length, average_glucose: avg, recent: readings.slice(0, 3) });
    }
    
    case 'get_goals': {
      const { data } = await supabase
        .from('health_goals')
        .select('goal_type, target_value, current_value, status')
        .eq('user_id', userId)
        .eq('status', args.status || 'active');
      
      return JSON.stringify({ goals: data || [] });
    }
    
    case 'suggest_log_bp': {
      // Return a suggested action for the user to confirm
      return JSON.stringify({
        action: 'log_bp',
        suggested_values: {
          systolic: args.systolic,
          diastolic: args.diastolic,
          heart_rate: args.heart_rate,
          ritual_type: args.ritual_type || 'morning',
        },
        message: `I can log this BP reading (${args.systolic}/${args.diastolic}) for you. Would you like me to save it?`
      });
    }
    
    case 'suggest_log_sugar': {
      return JSON.stringify({
        action: 'log_sugar',
        suggested_values: {
          glucose_mg_dl: args.glucose_mg_dl,
          measurement_type: args.measurement_type,
        },
        message: `I can log this blood sugar reading (${args.glucose_mg_dl} mg/dL, ${args.measurement_type}) for you. Would you like me to save it?`
      });
    }
    
    case 'suggest_set_goal': {
      return JSON.stringify({
        action: 'set_goal',
        suggested_values: {
          goal_type: args.goal_type,
          target_value: args.target_value,
        },
        reasoning: args.reasoning,
        message: `Based on your health data, I suggest setting a goal for ${args.goal_type} with target ${args.target_value}. ${args.reasoning}`
      });
    }

    // L2 Agent Control Functions
    case 'get_agent_status': {
      const [prefsRes, actionsRes] = await Promise.all([
        supabase.from('agent_preferences').select('*').eq('user_id', userId).single(),
        supabase.from('agent_action_log').select('action_type, created_at, status').eq('user_id', userId).eq('status', 'completed').order('created_at', { ascending: false }).limit(5)
      ]);
      
      const prefs = prefsRes.data || { autonomy_level: 'balanced', auto_nudge_enabled: true };
      const recentActions = actionsRes.data || [];
      
      return JSON.stringify({
        autonomy_level: prefs.autonomy_level,
        auto_nudge_enabled: prefs.auto_nudge_enabled,
        auto_celebrate_enabled: prefs.auto_celebrate_enabled,
        auto_goal_adjust_enabled: prefs.auto_goal_adjust_enabled,
        recent_actions_count: recentActions.length,
        last_action: recentActions[0] ? `${recentActions[0].action_type} at ${recentActions[0].created_at}` : 'None'
      });
    }

    case 'update_agent_autonomy': {
      const { error } = await supabase.from('agent_preferences').upsert({
        user_id: userId,
        autonomy_level: args.autonomy_level,
        auto_goal_adjust_enabled: args.autonomy_level === 'full'
      });
      
      if (error) {
        return JSON.stringify({ success: false, error: error.message });
      }
      
      const descriptions: Record<string, string> = {
        minimal: 'I will only observe and provide insights, no automatic actions.',
        balanced: 'I will send helpful nudges and celebrate your achievements, but won\'t change your goals.',
        full: 'I will proactively help you by adjusting goals and taking actions to support your health journey.'
      };
      
      return JSON.stringify({
        success: true,
        new_level: args.autonomy_level,
        message: descriptions[args.autonomy_level] || 'Autonomy updated.'
      });
    }

    case 'get_agent_actions': {
      const limit = args.limit || 10;
      const { data } = await supabase
        .from('agent_action_log')
        .select('action_type, action_payload, trigger_reason, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      const actions = data || [];
      if (actions.length === 0) {
        return JSON.stringify({ message: "I haven't taken any autonomous actions yet." });
      }
      
      const summary = actions.map((a: any) => ({
        action: a.action_type.replace(/_/g, ' '),
        reason: a.trigger_reason,
        when: a.created_at,
        status: a.status
      }));
      
      return JSON.stringify({ recent_actions: summary, total_shown: actions.length });
    }
    
    default:
      return JSON.stringify({ error: `Unknown function: ${functionName}` });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract the JWT token from "Bearer <token>"
    const token = authHeader.replace("Bearer ", "");
    
    // Create Supabase client with service role key for admin operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Verify the user's JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("Authentication failed:", authError?.message || "No user found");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("Authenticated user:", user.id);

    // Check rate limit: 20 messages per minute
    const { data: rateLimitOk, error: rateLimitError } = await supabase
      .rpc('check_rate_limit', {
        _user_id: user.id,
        _endpoint: 'chat-copilot',
        _max_requests: 20,
        _window_seconds: 60
      });

    if (rateLimitError) {
      console.error("Rate limit check failed:", rateLimitError);
    } else if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and parse input
    const body = await req.json();
    const validated = chatSchema.parse(body);
    const { messages, language } = validated;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      console.error("[ChatCopilot] GEMINI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[ChatCopilot] Request start", {
      userId: user.id,
      language,
      messagesCount: messages.length,
      hasGeminiApiKey: !!GEMINI_API_KEY,
    });

    // Fetch user's health data for personalized context
    const healthContext = await getUserHealthContext(supabase, user.id);

    // Enhanced system prompt with health data context and agent capabilities
    const systemPrompt = language === "hi" 
      ? `आप Beat ऐप के लिए एक विशेषज्ञ AI स्वास्थ्य कोच हैं। आप भारतीय वरिष्ठ नागरिकों (40-70 वर्ष) को उनके रक्तचाप, रक्त शर्करा और हृदय स्वास्थ्य का प्रबंधन करने में मदद करते हैं।

${healthContext}

आपके पास उपयोगकर्ता के स्वास्थ्य डेटा तक पहुंचने और कार्रवाई सुझाने के लिए टूल्स हैं:
- get_health_summary: वर्तमान स्वास्थ्य स्थिति प्राप्त करें
- get_bp_history: BP इतिहास देखें
- get_sugar_history: शुगर इतिहास देखें
- get_goals: स्वास्थ्य लक्ष्य देखें
- suggest_log_bp: जब उपयोगकर्ता BP नंबर बताए तो लॉग करने का सुझाव दें
- suggest_log_sugar: जब उपयोगकर्ता शुगर नंबर बताए तो लॉग करने का सुझाव दें
- suggest_set_goal: स्वास्थ्य लक्ष्य सेट करने का सुझाव दें

महत्वपूर्ण दिशानिर्देश:
- उपयोगकर्ता के वास्तविक स्वास्थ्य डेटा के आधार पर व्यक्तिगत सलाह दें
- जब उपयोगकर्ता संख्याएं बताए (जैसे "मेरा BP 140/90 है"), उचित suggest_ फ़ंक्शन का उपयोग करें
- गर्मजोशी से, सरल हिंदी में बात करें
- कभी भी चिकित्सा निदान न करें
- यदि BP ≥180/120 या शुगर ≥300 है, तो तुरंत डॉक्टर से मिलने की सलाह दें
- प्रतिक्रियाएं संक्षिप्त रखें (100 शब्दों से कम)`
      : `You are an expert AI health coach for the Beat app, helping Indian seniors (aged 40-70) manage their blood pressure, blood sugar, and heart health.

${healthContext}

You have tools to access user health data and suggest actions:
- get_health_summary: Get current health status overview
- get_bp_history: View BP reading history
- get_sugar_history: View blood sugar history  
- get_goals: View active health goals
- suggest_log_bp: When user mentions BP numbers, suggest logging them
- suggest_log_sugar: When user mentions sugar/glucose numbers, suggest logging them
- suggest_set_goal: Suggest setting a health goal based on conversation

CRITICAL GUIDELINES:
- Use tools proactively to fetch relevant data before giving advice
- When user mentions numbers (e.g., "My BP is 145/92", "Log my sugar as 130", "My reading was 180 after lunch"), ALWAYS use the appropriate suggest_ function
- Reference their specific data when giving advice
- Be warm, empathetic, and use simple language
- NEVER provide medical diagnoses - you give health coaching, not medical advice
- If BP ≥180/120 or Sugar ≥300, IMMEDIATELY recommend seeking emergency medical care
- Keep responses SHORT and conversational (under 60 words) - users may be listening via voice
- Speak naturally as if talking to a friend
- Always end with encouragement or a follow-up question

VOICE COMMAND PATTERNS (recognize these natural speech patterns):
- "Log my BP as X over Y" / "My BP is X/Y" → suggest_log_bp
- "My sugar is X" / "Log sugar X" → suggest_log_sugar  
- "How am I doing?" / "Give me my summary" → get_health_summary
- "What's my trend?" / "Show my history" → get_bp_history or get_sugar_history
- "Set a goal for X" → suggest_set_goal

MEDICAL DISCLAIMER: Always remind users that this is health coaching guidance, not medical diagnosis.`;

    const geminiContents = convertMessagesToGeminiContents(messages);

    // First Gemini call with tools. This remains non-streaming because tool calls
    // must be inspected and executed before the final user-facing response.
    const aiResponse = await callGemini({
      apiKey: GEMINI_API_KEY,
      systemPrompt,
      contents: geminiContents,
      includeTools: true,
      logContext: "tool-selection",
    });

    const functionCalls = extractGeminiFunctionCalls(aiResponse);
    console.log("[ChatCopilot] Parse complete", {
      logContext: "tool-selection",
      functionCallCount: functionCalls.length,
      textPreview: trimForLog(extractGeminiText(aiResponse)),
    });

    // Check if there are tool calls
    if (functionCalls.length > 0) {
      // Execute tool calls
      const toolResults = [];
      for (const toolCall of functionCalls) {
        const functionName = toolCall.name;
        const args = toolCall.args;
        
        console.log(`Executing tool: ${functionName}`, args);
        
        const result = await executeAgentFunction(supabase, user.id, functionName, args);
        toolResults.push({
          tool_call_id: toolCall.id,
          name: functionName,
          role: "tool",
          content: result,
        });
      }

      const finalContents = [
        ...geminiContents,
        {
          role: "model",
          parts: functionCalls.map((toolCall) => ({
            functionCall: {
              name: toolCall.name,
              args: toolCall.args,
            },
          })),
        },
        {
          role: "user",
          parts: toolResults.map((toolResult) => ({
            functionResponse: {
              name: toolResult.name,
              response: {
                result: toolResult.content,
              },
            },
          })),
        },
      ];

      // Second Gemini call with tool results. It returns complete text, then this
      // function wraps it as OpenAI-compatible SSE for the existing frontend.
      const finalResponse = await callGemini({
        apiKey: GEMINI_API_KEY,
        systemPrompt,
        contents: finalContents,
        logContext: "final-with-tools",
      });

      const finalText = extractGeminiText(finalResponse);
      console.log("[ChatCopilot] Parse complete", {
        logContext: "final-with-tools",
        textPreview: trimForLog(finalText),
        textLength: finalText.length,
      });

      if (!finalText) {
        console.error("[ChatCopilot] Gemini final response did not include text", finalResponse);
        return new Response(
          JSON.stringify({ error: "Invalid Gemini response" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return createSseResponse(finalText);
    }

    // No tool calls - return the first Gemini text as OpenAI-compatible SSE.
    let responseText = extractGeminiText(aiResponse);
    if (!responseText) {
      const directResponse = await callGemini({
        apiKey: GEMINI_API_KEY,
        systemPrompt,
        contents: geminiContents,
        logContext: "direct-response",
      });

      responseText = extractGeminiText(directResponse);
      console.log("[ChatCopilot] Parse complete", {
        logContext: "direct-response",
        textPreview: trimForLog(responseText),
        textLength: responseText.length,
      });
    }

    if (!responseText) {
      console.error("[ChatCopilot] Gemini response did not include text", aiResponse);
      return new Response(
        JSON.stringify({ error: "Invalid Gemini response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[ChatCopilot] Parse complete", {
      logContext: "no-tools",
      textPreview: trimForLog(responseText),
      textLength: responseText.length,
    });

    return createSseResponse(responseText);

  } catch (error) {
    console.error("Chat copilot error:", error);
    
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes("Gemini quota exhausted")) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (
        error.message.includes("Gemini API unauthorized") ||
        error.message.includes("Gemini API permission denied")
      ) {
        return new Response(
          JSON.stringify({ error: "AI service error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (error.message.includes("Invalid Gemini response")) {
        return new Response(
          JSON.stringify({ error: "Invalid Gemini response" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
