import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Checkout } from "capacitor-razorpay";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Loader2, Shield, Zap, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "./Logo";

interface RazorpayCheckoutProps {
  open: boolean;
  onClose: () => void;
  planType: "basic" | "premium";
  onSuccess: () => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

const planDetails = {
  basic: {
    name: "Beat Basic",
    price: "₹99",
    amount: 9900,
    features: [
      "Family dashboard access",
      "Weekly health summaries", 
      "Goal tracking & progress",
      "Advanced trend charts",
      "Export health data"
    ],
    color: "from-secondary to-secondary/80"
  },
  premium: {
    name: "Beat Premium",
    price: "₹199",
    amount: 19900,
    features: [
      "All Basic features",
      "AI Beat Health Coach",
      "PDF reports for doctors",
      "WhatsApp health summaries",
      "Priority support",
      "Monthly teleconsult"
    ],
    color: "from-primary to-accent"
  }
};

const parsePaymentError = (err: unknown) => {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message ?? "")
          : "";

  let code = "";
  let description = rawMessage.trim();

  try {
    const parsed = JSON.parse(rawMessage);
    code = typeof parsed.code === "string" ? parsed.code : "";
    description = typeof parsed.description === "string" ? parsed.description : rawMessage;
  } catch {
    // Native Razorpay errors may be plain strings.
  }

  const normalized = `${code} ${description}`.toLowerCase();
  const hasUsefulMessage = Boolean(description) && !["undefined", "null", "{}"].includes(normalized.trim());
  const cancelled =
    !hasUsefulMessage ||
    normalized.includes("cancel") ||
    normalized.includes("dismiss") ||
    normalized.includes("back pressed") ||
    normalized.includes("payment cancelled") ||
    normalized.includes("user cancelled");

  return {
    cancelled,
    message: cancelled
      ? "Payment cancelled"
      : hasUsefulMessage
        ? description
        : "Payment could not be completed. Please try again.",
  };
};

export const RazorpayCheckout = ({ open, onClose, planType, onSuccess }: RazorpayCheckoutProps) => {
  const [loading, setLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = planDetails[planType];
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  const resetAndClose = () => {
    setLoading(false);
    setError(null);
    onClose();
  };

  // Load Razorpay script
  useEffect(() => {
    if (isAndroidNative) {
      setScriptLoaded(true);
      return;
    }

    if (typeof window !== "undefined" && !window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => setError("Failed to load payment gateway");
      document.body.appendChild(script);
    } else if (window.Razorpay) {
      setScriptLoaded(true);
    }
  }, [isAndroidNative]);

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to continue");
        return;
      }

      // Create order via edge function
      const { data, error: invokeError } = await supabase.functions.invoke("create-checkout", {
        body: { planType, userId: user.id, email: user.email }
      });

      if (invokeError) throw invokeError;

      // Demo mode - subscription activated directly
      if (data?.success && !data?.orderId) {
        toast.success("🎉 " + (data.message || "Subscription activated!"));
        onSuccess();
        onClose();
        return;
      }

      const verifyPayment = async (response: any) => {
        try {
          const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-payment", {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              userId: user.id,
              planType
            }
          });

          if (verifyError) throw verifyError;

          toast.success("🎉 Payment successful! Welcome to " + plan.name);
          onSuccess();
          onClose();
        } catch (err) {
          console.error("Payment verification error:", err);
          toast.error("Payment verification failed. Please contact support.");
        }
      };

      // Live Razorpay payment
      if (!isAndroidNative && !window.Razorpay) {
        throw new Error("Payment gateway not loaded");
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "Beat",
        description: `${plan.name} Subscription`,
        order_id: data.orderId,
        handler: verifyPayment,
        prefill: {
          email: user.email,
          contact: "+917416772781"
        },
        notes: {
          user_id: user.id,
          plan_type: planType
        },
        theme: {
          color: "#E63946"
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          }
        }
      };

      if (isAndroidNative) {
        try {
          const result = await Checkout.open(options as any);
          await verifyPayment(result?.response ?? result);
        } catch (err) {
          const paymentError = parsePaymentError(err);
          console.error("Payment error:", err);

          if (paymentError.cancelled) {
            resetAndClose();
            return;
          }

          setError(paymentError.message);
          toast.error(paymentError.message);
        }
        return;
      }

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err) {
      const paymentError = parsePaymentError(err);
      console.error("Payment error:", err);
      setError(paymentError.message);
      toast.error(paymentError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && resetAndClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="w-20 h-20 rounded-2xl bg-black flex items-center justify-center shadow-lg">
              <Logo size="lg" showText={false} />
            </div>
          </div>
          <DialogTitle className="flex items-center justify-center gap-2 text-xl">
            <Crown className="w-5 h-5 text-primary" />
            Upgrade to {plan.name}
          </DialogTitle>
          <DialogDescription>
            Unlock premium health features with a secure payment
          </DialogDescription>
        </DialogHeader>

        <Card className={`p-6 bg-gradient-to-br ${plan.color}/10 border-primary/20`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-black flex items-center justify-center">
                <Logo size="md" showText={false} />
              </div>
              <div>
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">Monthly subscription</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{plan.price}</div>
              <div className="text-xs text-muted-foreground">/month</div>
            </div>
          </div>

          <div className="space-y-2 mb-6">
            {plan.features.map((feature, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {planType === "premium" && (
            <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary">
              <Zap className="w-3 h-3 mr-1" />
              7-day free trial included
            </Badge>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          <Button 
            onClick={handlePayment} 
            disabled={loading || (!scriptLoaded && !error)}
            className={`w-full h-12 bg-gradient-to-r ${plan.color} hover:opacity-90`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Pay {plan.price}/month
              </>
            )}
          </Button>
        </Card>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-4 h-4" />
          <span>Secure payment via Razorpay • Cancel anytime</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
