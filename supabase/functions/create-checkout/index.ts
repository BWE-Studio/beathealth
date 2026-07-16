import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getFirstKeyFromJson = (value: string | undefined) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const firstKey = Object.values(parsed).find((key) => typeof key === "string");
      return typeof firstKey === "string" ? firstKey : null;
    }
  } catch {
    return null;
  }

  return null;
};

const getSupabasePublishableKey = () =>
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  getFirstKeyFromJson(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));

const getSupabaseSecretKey = () =>
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  getFirstKeyFromJson(Deno.env.get("SUPABASE_SECRET_KEYS"));

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization header exists
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabasePublishableKey = getSupabasePublishableKey();

    if (!supabaseUrl || !supabasePublishableKey) {
      console.error("Missing Supabase auth configuration", {
        hasUrl: Boolean(supabaseUrl),
        hasPublishableKey: Boolean(supabasePublishableKey),
      });
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth context to verify their identity
    const supabaseAuth = createClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      console.error("Failed to get authenticated user:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { planType, userId, email } = await req.json();

    // CRITICAL: Validate that the authenticated user matches the userId in the request
    if (user.id !== userId) {
      console.error(`User ID mismatch: authenticated user ${user.id} tried to create checkout for ${userId}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized - User ID mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating checkout for user ${user.id}, plan: ${planType}`);

    // Use service role client for database operations
    const supabaseSecretKey = getSupabaseSecretKey();

    if (!supabaseSecretKey) {
      console.error("Missing Supabase service/secret key configuration");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseSecretKey);

    // Get Razorpay credentials from secrets
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!razorpayKeyId || !razorpayKeySecret) {
      // For demo purposes, return a mock checkout URL if Razorpay is not configured
      console.log("Razorpay not configured, returning demo mode");
      
      // Update subscription to premium directly for demo - use authenticated user's ID
      const { data: subscriptionData, error: subscriptionError } = await supabaseClient
        .from("subscriptions")
        .upsert({
          user_id: user.id,
          plan_type: planType,
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "user_id" })
        .select()
        .single();

      if (subscriptionError) {
        console.error("Subscription upsert failed:", subscriptionError);
        return new Response(
          JSON.stringify({ error: "Failed to activate subscription", details: subscriptionError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Subscription upsert result:", subscriptionData);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Demo mode: Subscription activated",
          checkoutUrl: null 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Plan pricing in paisa (INR * 100)
    const planPricing: Record<string, number> = {
      basic: 9900, // ₹99
      premium: 19900, // ₹199
    };

    const amount = planPricing[planType] || 19900;

    // Create Razorpay order - use authenticated user's ID
    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: `beat_${Date.now()}`,
        notes: {
          user_id: user.id, // Use authenticated user's ID
          plan_type: planType,
          email: email || user.email,
        },
      }),
    });

    if (!orderResponse.ok) {
      const error = await orderResponse.text();
      console.error("Razorpay order creation failed:", error);
      throw new Error("Failed to create payment order");
    }

    const order = await orderResponse.json();

    console.log(`Razorpay order created: ${order.id} for user ${user.id}`);

    return new Response(
      JSON.stringify({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: razorpayKeyId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating checkout:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
