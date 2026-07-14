import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const requestSchema = z.object({
  imageBase64: z.string().max(10000000).optional(), // Max ~7MB base64
  description: z.string().max(500).optional(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional().default('lunch'),
}).refine(data => data.imageBase64 || data.description, {
  message: 'Either image or description is required',
});

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("[MealAI] GEMINI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const validated = requestSchema.parse(body);
    const { imageBase64, description, mealType } = validated;

    // Build the prompt
    const systemPrompt = `You are an expert Indian nutritionist AI. Analyze the meal and provide detailed nutritional information.

Focus on Indian foods: roti, chapati, paratha, dal, rice, sabzi, curry, biryani, dosa, idli, sambar, chole, paneer, etc.

For each food item, estimate:
- Name (in English, with Hindi/regional name if applicable)
- Portion size (e.g., "2 medium", "1 cup", "150g")
- Calories
- Carbohydrates (grams)
- Protein (grams)  
- Fat (grams)
- Glycemic index category (low/medium/high)

Also calculate:
- Total glycemic load (GL) for the meal
- A brief health tip relevant to the user's health (diabetes/BP management)

Respond ONLY with valid JSON in this exact format:
{
  "items": [
    {
      "name": "Roti (Chapati)",
      "portion": "2 medium",
      "calories": 160,
      "carbs": 32,
      "protein": 5,
      "fat": 1,
      "glycemicIndex": "medium"
    }
  ],
  "totalCalories": 450,
  "totalCarbs": 65,
  "glycemicLoad": 18,
  "healthTip": "Adding more vegetables to your meal can help reduce blood sugar spikes."
}`;

    const userParts: any[] = [];

    if (imageBase64) {
      const image = parseImageInput(imageBase64);
      userParts.push({
        inline_data: {
          mime_type: image.mimeType,
          data: image.data,
        },
      });
    }

    userParts.push({
      text: `Analyze this ${mealType} meal.${description ? ` Description: ${description}` : ''} Provide detailed nutritional breakdown.`,
    });

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: userParts,
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.1,
        response_mime_type: "application/json",
      },
    };

    console.log("[MealAI] Calling Gemini API", {
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      model: "gemini-2.5-flash",
      mealType,
      hasImage: !!imageBase64,
      hasDescription: !!description,
      imageBase64Length: imageBase64?.length ?? null,
    });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[MealAI] Gemini response status", {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    });

    const responseText = await response.text();
    console.log("[MealAI] Gemini response body", {
      bodyPreview: trimForLog(responseText),
      bodyLength: responseText.length,
    });

    if (!response.ok) {
      console.error("[MealAI] Gemini API error", {
        status: response.status,
        statusText: response.statusText,
        errorText: trimForLog(responseText),
      });

      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Gemini API unauthorized. Check GEMINI_API_KEY.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Gemini API permission denied.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Gemini quota exhausted. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI API error: ${response.status}`);
    }

    let aiResponse: any;
    try {
      aiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("[MealAI] Invalid Gemini JSON response:", {
        parseError,
        responsePreview: trimForLog(responseText),
      });
      throw new Error("Invalid Gemini response");
    }

    const content = extractGeminiText(aiResponse);

    if (!content) {
      console.error("[MealAI] Gemini response did not include text content", {
        aiResponse,
      });
      throw new Error('No response from AI');
    }

    console.log("[MealAI] Gemini text response", {
      contentPreview: trimForLog(content),
      contentLength: content.length,
    });

    // Parse the JSON response
    let analysis;
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[MealAI] Failed to parse Gemini response:", {
        parseError,
        contentPreview: trimForLog(content),
      });
      // Provide fallback response
      analysis = {
        items: [{
          name: description || 'Unidentified meal',
          portion: '1 serving',
          calories: 300,
          carbs: 40,
          protein: 10,
          fat: 10,
          glycemicIndex: 'medium',
        }],
        totalCalories: 300,
        totalCarbs: 40,
        glycemicLoad: 15,
        healthTip: 'For better blood sugar control, try pairing carbs with protein and fiber.',
      };
    }

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in analyze-meal-image:', error);
    
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
      JSON.stringify({ error: error.message || 'Failed to analyze meal' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseImageInput(imageBase64: string): { mimeType: string; data: string } {
  const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.*)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1],
      data: dataUrlMatch[2],
    };
  }

  return {
    mimeType: "image/jpeg",
    data: imageBase64,
  };
}

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
