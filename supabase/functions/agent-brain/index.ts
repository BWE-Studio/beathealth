import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

// Internal secret for cron/scheduler calls
const INTERNAL_SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Input validation schema
const requestSchema = z.object({
  userId: z.string().uuid(),
  triggerType: z.enum(['scheduled', 'bp_logged', 'sugar_logged', 'morning_analysis', 'evening_analysis', 'streak_check', 'manual']),
  triggerPayload: z.record(z.any()).optional().default({}),
});

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// L2 Agent Tool Definitions
const agentTools = [
  // READ TOOLS
  {
    type: "function",
    function: {
      name: "get_health_summary",
      description: "Get comprehensive health summary including latest BP, sugar, streaks, and heart score",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_recent_trends",
      description: "Analyze BP and sugar trends over the past 7 days",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "check_streak_risk",
      description: "Check if user's streak is at risk of breaking",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  // AUTONOMOUS WRITE TOOLS (L2 specific)
  {
    type: "function",
    function: {
      name: "auto_send_nudge",
      description: "Send a proactive nudge to the user",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The nudge message" },
          category: { type: "string", enum: ["motivation", "health_alert", "celebration", "reminder", "insight"] },
          urgency: { type: "string", enum: ["low", "normal", "high"] }
        },
        required: ["message", "category"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "auto_celebrate",
      description: "Trigger a celebration for an achievement",
      parameters: {
        type: "object",
        properties: {
          achievement_type: { type: "string", description: "Type of achievement" },
          message: { type: "string", description: "Celebration message" }
        },
        required: ["achievement_type", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "auto_adjust_goal",
      description: "Automatically adjust a health goal based on progress",
      parameters: {
        type: "object",
        properties: {
          goal_type: { type: "string", description: "Type of goal (bp, sugar, steps, weight)" },
          new_target: { type: "number", description: "New target value" },
          reason: { type: "string", description: "Reason for adjustment" }
        },
        required: ["goal_type", "new_target", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_followup",
      description: "Schedule a follow-up check for the user",
      parameters: {
        type: "object",
        properties: {
          check_type: { type: "string", description: "Type of check to schedule" },
          delay_hours: { type: "number", description: "Hours to wait before check" },
          message: { type: "string", description: "Message to show at followup" }
        },
        required: ["check_type", "delay_hours"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "escalate_concern",
      description: "Flag a health concern for user attention",
      parameters: {
        type: "object",
        properties: {
          concern_type: { type: "string", enum: ["bp_trend", "sugar_trend", "missed_meds", "streak_at_risk", "irregular_pattern"] },
          severity: { type: "string", enum: ["info", "warning", "urgent"] },
          recommendation: { type: "string", description: "Recommended action" }
        },
        required: ["concern_type", "severity", "recommendation"]
      }
    }
  }
];

function trimForLog(value: string, maxLength = 1200): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [trimmed ${value.length - maxLength} chars]`;
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
    tools: [{
      function_declarations: convertToolsToGeminiDeclarations(agentTools),
    }],
    tool_config: {
      function_calling_config: {
        mode: "AUTO",
      },
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
  };

  console.log("[Agent Brain] Calling Gemini", {
    endpoint: GEMINI_ENDPOINT,
    model: "gemini-2.5-flash",
    contentsCount: requestBody.contents.length,
    toolsCount: agentTools.length,
  });

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${params.apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("[Agent Brain] Gemini response status", {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  });

  const responseText = await response.text();
  console.log("[Agent Brain] Gemini response preview", {
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
    console.error("[Agent Brain] Invalid Gemini JSON response", {
      error,
      responsePreview: trimForLog(responseText),
    });
    throw new Error("Invalid Gemini response");
  }
}

// Fetch user's full health context including memory and model
async function getUserContext(supabase: any, userId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().split('T')[0];

  const [profile, bpLogs, sugarLogs, streaks, heartScores, goals, preferences, recentActions, userMemories, userModel] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('bp_logs').select('*').eq('user_id', userId).gte('measured_at', sevenDaysAgo).order('measured_at', { ascending: false }),
    supabase.from('sugar_logs').select('*').eq('user_id', userId).gte('measured_at', sevenDaysAgo).order('measured_at', { ascending: false }),
    supabase.from('streaks').select('*').eq('user_id', userId),
    supabase.from('heart_scores').select('*').eq('user_id', userId).order('score_date', { ascending: false }).limit(7),
    supabase.from('health_goals').select('*').eq('user_id', userId).eq('status', 'active'),
    supabase.from('agent_preferences').select('*').eq('user_id', userId).single(),
    supabase.from('agent_action_log').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
    // NEW: Fetch user memories (preferences, patterns, facts)
    supabase.from('user_memory').select('*').eq('user_id', userId).order('access_count', { ascending: false }).limit(50),
    // NEW: Fetch user model (persona, engagement patterns, success patterns)
    supabase.from('user_model').select('*').eq('user_id', userId).single()
  ]);

  // Calculate trends
  const bpTrend = analyzeBPTrend(bpLogs.data || []);
  const sugarTrend = analyzeSugarTrend(sugarLogs.data || []);
  const mainStreak = streaks.data?.find((s: any) => s.type === 'main');
  const latestHeartScore = heartScores.data?.[0];

  // Process memories into usable format
  const memories = {
    preferences: (userMemories.data || []).filter((m: any) => m.memory_type === 'preference'),
    facts: (userMemories.data || []).filter((m: any) => m.memory_type === 'fact'),
    patterns: (userMemories.data || []).filter((m: any) => m.memory_type === 'pattern'),
    contexts: (userMemories.data || []).filter((m: any) => m.memory_type === 'context')
  };

  return {
    profile: profile.data,
    preferences: preferences.data || { autonomy_level: 'balanced', auto_nudge_enabled: true, auto_celebrate_enabled: true, auto_escalate_enabled: true, auto_goal_adjust_enabled: false, max_nudges_per_day: 5 },
    health: {
      latestBP: bpLogs.data?.[0],
      latestSugar: sugarLogs.data?.[0],
      bpTrend,
      sugarTrend,
      mainStreak: mainStreak?.count || 0,
      lastStreakLog: mainStreak?.last_logged_at,
      heartScore: latestHeartScore?.heart_score,
      activeGoals: goals.data || []
    },
    recentActions: recentActions.data || [],
    // NEW: Memory context for personalization
    memories,
    userModel: userModel.data || null,
    today,
    currentHour: now.getHours()
  };
}

function analyzeBPTrend(logs: any[]) {
  if (logs.length < 3) return { trend: 'insufficient_data', average: null };
  const recent = logs.slice(0, 5);
  const avgSystolic = recent.reduce((sum, l) => sum + l.systolic, 0) / recent.length;
  const avgDiastolic = recent.reduce((sum, l) => sum + l.diastolic, 0) / recent.length;
  
  // Compare first half to second half
  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid);
  const secondHalf = recent.slice(mid);
  const firstAvg = firstHalf.reduce((sum, l) => sum + l.systolic, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, l) => sum + l.systolic, 0) / secondHalf.length;
  
  let trend = 'stable';
  if (firstAvg - secondAvg > 5) trend = 'improving';
  else if (secondAvg - firstAvg > 5) trend = 'worsening';
  
  const status = avgSystolic < 120 && avgDiastolic < 80 ? 'normal' :
                 avgSystolic < 140 && avgDiastolic < 90 ? 'elevated' : 'high';
  
  return { trend, average: { systolic: Math.round(avgSystolic), diastolic: Math.round(avgDiastolic) }, status, count: logs.length };
}

function analyzeSugarTrend(logs: any[]) {
  if (logs.length < 3) return { trend: 'insufficient_data', average: null };
  const fastingLogs = logs.filter(l => l.measurement_type === 'fasting');
  if (fastingLogs.length < 2) return { trend: 'insufficient_data', average: null };
  
  const avgFasting = fastingLogs.reduce((sum, l) => sum + l.glucose_mg_dl, 0) / fastingLogs.length;
  const status = avgFasting < 100 ? 'normal' : avgFasting < 126 ? 'pre_diabetic' : 'diabetic_range';
  
  return { trend: 'stable', average: Math.round(avgFasting), status, count: logs.length };
}

// Check guardrails before allowing action
async function checkGuardrails(supabase: any, userId: string, actionType: string, preferences: any): Promise<{ allowed: boolean; reason?: string }> {
  if (actionType === 'auto_nudge' && !preferences.auto_nudge_enabled) {
    return { allowed: false, reason: 'Auto-nudge disabled by user' };
  }
  if (actionType === 'auto_celebrate' && !preferences.auto_celebrate_enabled) {
    return { allowed: false, reason: 'Auto-celebrate disabled by user' };
  }
  if (actionType === 'auto_goal_adjust' && !preferences.auto_goal_adjust_enabled) {
    return { allowed: false, reason: 'Auto goal adjustment disabled by user' };
  }
  if (actionType === 'escalate_concern' && !preferences.auto_escalate_enabled) {
    return { allowed: false, reason: 'Auto-escalation disabled by user' };
  }

  // Check quiet hours
  const now = new Date();
  const currentHour = now.getHours();
  const quietStart = parseInt(preferences.quiet_hours_start?.split(':')[0] || '22');
  const quietEnd = parseInt(preferences.quiet_hours_end?.split(':')[0] || '7');
  
  const inQuietHours = (quietStart > quietEnd) 
    ? (currentHour >= quietStart || currentHour < quietEnd)
    : (currentHour >= quietStart && currentHour < quietEnd);
  
  if (inQuietHours && actionType !== 'escalate_concern') {
    return { allowed: false, reason: 'User is in quiet hours' };
  }

  // Check daily limits for nudges
  if (actionType === 'auto_nudge') {
    const { data: count } = await supabase.rpc('get_agent_nudge_count_today', { p_user_id: userId });
    if (count >= preferences.max_nudges_per_day) {
      return { allowed: false, reason: `Daily nudge limit reached (${preferences.max_nudges_per_day})` };
    }
  }

  // Check weekly limits for goal adjustments
  if (actionType === 'auto_goal_adjust') {
    const { data: count } = await supabase.rpc('get_agent_goal_adjustments_this_week', { p_user_id: userId });
    if (count >= preferences.max_goal_adjustments_per_week) {
      return { allowed: false, reason: `Weekly goal adjustment limit reached (${preferences.max_goal_adjustments_per_week})` };
    }
  }

  return { allowed: true };
}

// Execute agent tool
async function executeAgentTool(supabase: any, userId: string, toolName: string, args: any, preferences: any, triggerType: string): Promise<{ success: boolean; result?: any; error?: string; actionId?: string }> {
  // Check guardrails for write operations
  if (['auto_nudge', 'auto_celebrate', 'auto_goal_adjust', 'escalate_concern'].includes(toolName)) {
    const guardrailCheck = await checkGuardrails(supabase, userId, toolName, preferences);
    if (!guardrailCheck.allowed) {
      return { success: false, error: guardrailCheck.reason };
    }
  }

  let result: any;
  let actionPayload = args;

  switch (toolName) {
    case 'get_health_summary':
      const context = await getUserContext(supabase, userId);
      return { success: true, result: context.health };

    case 'get_recent_trends':
      const trendContext = await getUserContext(supabase, userId);
      return { success: true, result: { bp: trendContext.health.bpTrend, sugar: trendContext.health.sugarTrend } };

    case 'check_streak_risk':
      const { data: streak } = await supabase.from('streaks').select('*').eq('user_id', userId).eq('type', 'main').single();
      const lastLogged = streak?.last_logged_at ? new Date(streak.last_logged_at) : null;
      const hoursSinceLog = lastLogged ? (Date.now() - lastLogged.getTime()) / (1000 * 60 * 60) : 999;
      return { success: true, result: { atRisk: hoursSinceLog > 20, hoursSinceLog: Math.round(hoursSinceLog), currentStreak: streak?.count || 0 } };

    case 'auto_send_nudge':
      const { error: nudgeError } = await supabase.from('ai_nudges').insert({
        user_id: userId,
        nudge_text: args.message,
        category: args.category,
        delivered_via: 'agent'
      });
      if (nudgeError) return { success: false, error: nudgeError.message };
      result = { sent: true, message: args.message };
      break;

    case 'auto_celebrate':
      // Check if achievement already exists
      const { data: existingAchievement } = await supabase.from('achievements')
        .select('id').eq('user_id', userId).eq('badge_type', args.achievement_type).single();
      
      if (!existingAchievement) {
        await supabase.from('achievements').insert({
          user_id: userId,
          badge_type: args.achievement_type,
          metadata: { message: args.message, source: 'agent' }
        });
      }
      
      // Also send a celebration nudge
      await supabase.from('ai_nudges').insert({
        user_id: userId,
        nudge_text: args.message,
        category: 'celebration',
        delivered_via: 'agent'
      });
      result = { celebrated: true, achievement: args.achievement_type };
      break;

    case 'auto_adjust_goal':
      const { data: goal } = await supabase.from('health_goals')
        .select('*').eq('user_id', userId).eq('goal_type', args.goal_type).eq('status', 'active').single();
      
      if (!goal) return { success: false, error: `No active ${args.goal_type} goal found` };
      
      const previousTarget = goal.target_value;
      await supabase.from('health_goals').update({ 
        target_value: args.new_target,
        notes: `Auto-adjusted by agent: ${args.reason}. Previous target: ${previousTarget}`
      }).eq('id', goal.id);
      
      result = { adjusted: true, goalType: args.goal_type, previousTarget, newTarget: args.new_target };
      actionPayload = { ...args, previousTarget };
      break;

    case 'schedule_followup':
      const scheduledFor = new Date(Date.now() + args.delay_hours * 60 * 60 * 1000);
      await supabase.from('agent_scheduled_tasks').insert({
        user_id: userId,
        task_type: args.check_type,
        scheduled_for: scheduledFor.toISOString(),
        priority: 5,
        payload: { message: args.message, original_trigger: triggerType }
      });
      result = { scheduled: true, scheduledFor: scheduledFor.toISOString() };
      break;

    case 'escalate_concern':
      await supabase.from('ai_nudges').insert({
        user_id: userId,
        nudge_text: `⚠️ ${args.severity.toUpperCase()}: ${args.recommendation}`,
        category: 'health_alert',
        delivered_via: 'agent'
      });
      result = { escalated: true, severity: args.severity };
      break;

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }

  // Log the action for transparency
  const { data: actionLog } = await supabase.from('agent_action_log').insert({
    user_id: userId,
    action_type: toolName,
    action_payload: actionPayload,
    trigger_reason: `Triggered by ${triggerType} analysis`,
    trigger_type: triggerType,
    status: 'completed'
  }).select('id').single();

  return { success: true, result, actionId: actionLog?.id };
}

// Main agent brain function
async function analyzeAndAct(supabase: any, userId: string, triggerType: string, triggerPayload: any = {}) {
  console.log(`[Agent Brain] Starting analysis for user ${userId}, trigger: ${triggerType}`);
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  if (!geminiApiKey) {
    console.error("[Agent Brain] GEMINI_API_KEY is not configured");
    return {
      success: false,
      error: "AI service not configured",
      context: null
    };
  }
  
  const context = await getUserContext(supabase, userId);
  const { preferences, health, profile, currentHour, recentActions, memories, userModel } = context;
  
  // Build system prompt based on autonomy level
  const autonomyInstructions = {
    minimal: "You are in OBSERVATION mode. Only call get_* functions to gather info. DO NOT take any auto_* actions. Simply report your observations.",
    balanced: "You are in BALANCED mode. You can send nudges, celebrate achievements, and escalate concerns. DO NOT adjust goals automatically. Be thoughtful and sparing with actions.",
    full: "You are in FULL AUTONOMY mode. You can take any action that would benefit the user's health journey. Be proactive but respectful. Max 1-2 actions per trigger."
  };

  // Format memories for prompt
  const memoryContext = memories.preferences.length > 0 || memories.patterns.length > 0 ? `
USER MEMORY (What you've learned about this user):
${memories.preferences.slice(0, 5).map((m: any) => `- Preference: ${m.key} = ${JSON.stringify(m.value)} (confidence: ${m.confidence})`).join('\n')}
${memories.patterns.slice(0, 5).map((m: any) => `- Pattern: ${m.key} = ${JSON.stringify(m.value)}`).join('\n')}
${memories.facts.slice(0, 3).map((m: any) => `- Fact: ${m.key} = ${JSON.stringify(m.value)}`).join('\n')}
` : '';

  // Format user model for prompt
  const modelContext = userModel ? `
USER MODEL (Inferred persona and patterns):
- Engagement Patterns: ${JSON.stringify(userModel.engagement_patterns || {})}
- Health Priorities: ${JSON.stringify(userModel.health_priorities || {})}
- Success Patterns: ${JSON.stringify(userModel.success_patterns || {})}
- Pain Points: ${JSON.stringify(userModel.pain_points || {})}
- Communication Preferences: ${JSON.stringify(userModel.communication_preferences || {})}
` : '';

  const systemPrompt = `You are Beat's L2 Health Agent. You proactively monitor and support the user's health journey.

AUTONOMY LEVEL: ${preferences.autonomy_level}
${autonomyInstructions[preferences.autonomy_level as keyof typeof autonomyInstructions] || autonomyInstructions.balanced}

USER PROFILE:
- Name: ${profile?.full_name || 'User'}
- Has Diabetes: ${profile?.has_diabetes ? 'Yes' : 'No'}
- Has Hypertension: ${profile?.has_hypertension ? 'Yes' : 'No'}
- Current Time: ${currentHour}:00
${memoryContext}
${modelContext}
HEALTH STATUS:
- Current Streak: ${health.mainStreak} days
- Latest Heart Score: ${health.heartScore || 'Not calculated'}
- BP Trend: ${JSON.stringify(health.bpTrend)}
- Sugar Trend: ${JSON.stringify(health.sugarTrend)}
- Active Goals: ${health.activeGoals.length}

RECENT AGENT ACTIONS (last 7 days): ${recentActions.length} actions taken
${recentActions.slice(0, 5).map((a: any) => `- ${a.action_type}: ${a.trigger_reason}`).join('\n')}

TRIGGER: ${triggerType}
TRIGGER DATA: ${JSON.stringify(triggerPayload)}

GUIDELINES:
1. Be concise and actionable
2. Avoid duplicate actions (check recent actions)
3. Personalize messages using user's name and what you know about them
4. For health alerts, be caring but not alarming
5. Celebrate milestones genuinely
6. If streak is at risk (>20hrs since log), prioritize reminder
7. RESPECT USER PREFERENCES from memory - if they ignore certain nudge types, avoid them
8. USE OPTIMAL TIMING from engagement patterns when possible
9. Adapt your communication style to match user preferences

Analyze the situation and decide what actions (if any) to take.`;

  try {
    console.log("[Agent Brain] Request start", {
      userId,
      triggerType,
      hasGeminiApiKey: !!geminiApiKey,
      autonomyLevel: preferences.autonomy_level,
    });

    const aiResponse = await callGemini({
      apiKey: geminiApiKey,
      systemPrompt,
      userPrompt: `Analyze the current situation and decide what actions to take based on the ${triggerType} trigger.`,
    });

    const toolCalls = extractGeminiFunctionCalls(aiResponse);
    const textResponse = extractGeminiText(aiResponse);

    console.log("[Agent Brain] Gemini parsing complete", {
      textPreview: trimForLog(textResponse || "Tool calls only"),
      toolCallCount: toolCalls.length,
    });

    if (!textResponse && toolCalls.length === 0) {
      console.error("[Agent Brain] Gemini response did not include text or tool calls", aiResponse);
      throw new Error("Invalid Gemini response");
    }

    const executedActions: any[] = [];

    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const toolName = toolCall.name;
        const args = toolCall.args;
        
        console.log(`[Agent Brain] Executing tool: ${toolName}`, args);
        
        const result = await executeAgentTool(supabase, userId, toolName, args, preferences, triggerType);
        executedActions.push({
          tool: toolName,
          args,
          ...result
        });
      }
    }

    return {
      success: true,
      analysis: textResponse,
      actions: executedActions,
      context: {
        streak: health.mainStreak,
        heartScore: health.heartScore,
        bpTrend: health.bpTrend?.trend,
        sugarTrend: health.sugarTrend?.trend
      }
    };
  } catch (error: any) {
    console.error('[Agent Brain] Error:', error);
    return {
      success: false,
      error: error.message,
      context: null
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION ==========
    // Check for internal secret (used by agent-scheduler cron job)
    const internalSecret = req.headers.get('x-internal-secret');
    const authHeader = req.headers.get('authorization');
    
    let isInternalCall = false;
    let authenticatedUserId: string | null = null;

    // Internal calls use x-internal-secret header with service role key
    if (internalSecret && INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) {
      isInternalCall = true;
      console.log('[agent-brain] Internal call authenticated via service key');
    } else if (authHeader) {
      // External calls require JWT authentication
      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
      if (userError || !user) {
        console.error('[agent-brain] Invalid authentication:', userError?.message);
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Invalid authentication' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      authenticatedUserId = user.id;
      console.log(`[agent-brain] User authenticated: ${user.id}`);
    } else {
      console.error('[agent-brain] No authentication provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const validated = requestSchema.parse(body);
    const { userId, triggerType, triggerPayload } = validated;

    // ========== AUTHORIZATION ==========
    // For external calls, ensure user can only trigger for themselves
    if (!isInternalCall && authenticatedUserId !== userId) {
      console.error(`[agent-brain] User ${authenticatedUserId} unauthorized to trigger agent for ${userId}`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Can only trigger agent for yourself' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const result = await analyzeAndAct(supabase, userId, triggerType, triggerPayload);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Agent Brain] Error:', error);

    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Agent brain error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
