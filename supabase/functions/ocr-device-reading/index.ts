import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OCRResult {
  success: boolean;
  device_type: "bp_monitor" | "glucose_meter" | "pulse_oximeter" | "thermometer" | "scale" | "unknown";
  readings: {
    systolic?: number;
    diastolic?: number;
    heart_rate?: number;
    glucose?: number;
    spo2?: number;
    temperature?: number;
    weight?: number;
    measurement_type?: "fasting" | "random" | "post_meal";
  };
  confidence: number;
  raw_text?: string;
  suggestions?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, deviceHint } = await req.json();

    console.log("[OCR][Edge] Request received", {
      method: req.method,
      deviceHint,
      hasImage: !!imageBase64,
      imageBase64Length: typeof imageBase64 === "string" ? imageBase64.length : null,
      imageBase64Prefix: typeof imageBase64 === "string" ? imageBase64.slice(0, 80) : null,
    });

    if (!imageBase64) {
      console.log("[OCR][Edge] Rejecting request: no image provided");
      return new Response(
        JSON.stringify({ success: false, error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("[OCR][Edge] GEMINI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert medical device OCR system. Your task is to accurately extract readings from photos of medical measurement devices.

DEVICE TYPES YOU CAN RECOGNIZE:
1. Blood Pressure Monitor: Look for SYS/DIA readings (mmHg), pulse/heart rate (bpm)
2. Glucose Meter: Look for mg/dL or mmol/L readings
3. Pulse Oximeter: Look for SpO2 (%), pulse rate
4. Thermometer: Look for °F or °C readings
5. Weight Scale: Look for kg or lbs readings

EXTRACTION RULES:
- Blood Pressure: systolic is typically the larger number (60-250), diastolic is smaller (40-150)
- Heart Rate: Usually displayed separately or below BP readings (30-200 bpm)
- Glucose: Fasting is typically <100 normal, 100-125 pre-diabetic, >126 diabetic
- SpO2: Normal is 95-100%
- Temperature: Normal is around 36.5-37.5°C or 97.5-99.5°F

CONFIDENCE SCORING:
- 0.9-1.0: Clear display, all numbers visible
- 0.7-0.9: Mostly clear, minor blur or glare
- 0.5-0.7: Partially obscured but readable
- Below 0.5: Unclear, guessing required

Return your analysis as a JSON object with this structure:
{
  "device_type": "bp_monitor" | "glucose_meter" | "pulse_oximeter" | "thermometer" | "scale" | "unknown",
  "readings": {
    "systolic": number | null,
    "diastolic": number | null,
    "heart_rate": number | null,
    "glucose": number | null,
    "spo2": number | null,
    "temperature": number | null,
    "weight": number | null
  },
  "confidence": number (0-1),
  "raw_text": "all text/numbers visible on display",
  "suggestions": "any tips to improve reading accuracy"
}`;

    const userPrompt = deviceHint 
      ? `Extract the readings from this ${deviceHint} device photo. Focus on the digital display.`
      : `Identify this medical device and extract all visible readings from the display.`;

    const image = parseImageInput(imageBase64);
    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: userPrompt },
            {
              inline_data: {
                mime_type: image.mimeType,
                data: image.data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.1,
        response_mime_type: "application/json",
      },
    };
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log("[OCR][Edge] Calling Gemini API", {
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      model: "gemini-2.5-flash",
      deviceHint,
      userPrompt,
      mimeType: image.mimeType,
      imageBase64Length: image.data.length,
      imageBase64Prefix: image.data.slice(0, 40),
    });

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[OCR][Edge] Gemini response status", {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    });

    const responseText = await response.text();
    console.log("[OCR][Edge] Gemini response body", {
      bodyPreview: trimForLog(responseText),
      bodyLength: responseText.length,
    });

    if (!response.ok) {
      console.error("[OCR][Edge] Gemini API error:", {
        status: response.status,
        statusText: response.statusText,
        errorText: trimForLog(responseText),
      });

      if (response.status === 401) {
        return new Response(
          JSON.stringify({ success: false, error: "Gemini API unauthorized. Check GEMINI_API_KEY." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 403) {
        return new Response(
          JSON.stringify({ success: false, error: "Gemini API permission denied." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Gemini quota exhausted. Please try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "Failed to analyze image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let aiResponse: any;
    try {
      aiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("[OCR][Edge] Invalid Gemini JSON response:", {
        parseError,
        responsePreview: trimForLog(responseText),
      });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Gemini response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = extractGeminiText(aiResponse);
    if (!content) {
      console.error("[OCR][Edge] Gemini response did not include text content", {
        aiResponse,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Gemini response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[OCR][Edge] AI response payload", {
      aiResponse,
      content,
      contentLength: content.length,
    });

    // Extract JSON from the response
    let ocrData: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      console.log("[OCR][Edge] JSON extraction result", {
        hasJsonMatch: !!jsonMatch,
        jsonPreview: jsonMatch?.[0]?.slice(0, 500),
      });
      if (jsonMatch) {
        ocrData = JSON.parse(jsonMatch[0]);
      }
      console.log("[OCR][Edge] Parsed OCR JSON", ocrData);
    } catch (parseError) {
      console.error("[OCR][Edge] JSON parse error:", parseError);
      // Try to extract numbers manually
      const numbers = content.match(/\d+/g)?.map(Number) || [];
      console.log("[OCR][Edge] Manual number extraction fallback", {
        numbers,
      });
      if (numbers.length >= 2) {
        const sorted = [...numbers].sort((a, b) => b - a);
        ocrData = {
          device_type: "bp_monitor",
          readings: {
            systolic: sorted[0] <= 250 ? sorted[0] : null,
            diastolic: sorted[1] <= 150 ? sorted[1] : null,
            heart_rate: sorted[2] && sorted[2] <= 200 ? sorted[2] : null,
          },
          confidence: 0.5,
          raw_text: content,
        };
      }
    }

    // Validate and sanitize readings
    const result: OCRResult = {
      success: true,
      device_type: ocrData.device_type || "unknown",
      readings: {
        systolic: validateNumber(ocrData.readings?.systolic, 60, 250),
        diastolic: validateNumber(ocrData.readings?.diastolic, 40, 150),
        heart_rate: validateNumber(ocrData.readings?.heart_rate, 30, 200),
        glucose: validateNumber(ocrData.readings?.glucose, 20, 600),
        spo2: validateNumber(ocrData.readings?.spo2, 70, 100),
        temperature: validateNumber(ocrData.readings?.temperature, 35, 42),
        weight: validateNumber(ocrData.readings?.weight, 20, 300),
      },
      confidence: Math.min(1, Math.max(0, ocrData.confidence || 0.5)),
      raw_text: ocrData.raw_text,
      suggestions: ocrData.suggestions,
    };

    // Determine measurement type for glucose based on time of day
    if (result.readings.glucose) {
      const hour = new Date().getHours();
      result.readings.measurement_type = hour < 10 ? "fasting" : "random";
    }

    console.log("[OCR][Edge] Final OCR result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[OCR][Edge] OCR exception:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

function validateNumber(value: any, min: number, max: number): number | undefined {
  const num = Number(value);
  if (isNaN(num) || num < min || num > max) return undefined;
  return Math.round(num);
}
