import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Shield, Phone, Check, Activity } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";

interface FallEvent {
  severity: string;
  acceleration_magnitude: number;
  location_lat?: number;
  location_lon?: number;
}

const FALL_THRESHOLD = 3.0; // 3g acceleration threshold
const STILLNESS_THRESHOLD = 0.3; // Low movement after fall
const STILLNESS_DURATION = 1500; // 1.5 seconds of stillness
const COUNTDOWN_SECONDS = 30;

export const FallDetectionMonitor = () => {
  const queryClient = useQueryClient();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [fallDetected, setFallDetected] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [currentAcceleration, setCurrentAcceleration] = useState(0);
  
  const accelerationHistory = useRef<number[]>([]);
  const stillnessTimer = useRef<NodeJS.Timeout | null>(null);
  const countdownTimer = useRef<NodeJS.Timeout | null>(null);
  const lastHighAcceleration = useRef<number>(0);

  // Check device support
  useEffect(() => {
    if (typeof DeviceMotionEvent !== "undefined") {
      setIsSupported(true);
      // Check if permission is needed (iOS 13+)
      if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
        setIsSupported(true);
      }
    }
  }, []);

  // Load enabled state from profile
  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("fall_detection_enabled")
          .eq("id", user.id)
          .single();
        
        if (data?.fall_detection_enabled) {
          setIsEnabled(true);
        }
      }
    };
    loadSettings();
  }, []);

  const logFallEvent = useMutation({
    mutationFn: async (event: FallEvent) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("fall_events")
        .insert({
          user_id: user.id,
          severity: event.severity,
          acceleration_magnitude: event.acceleration_magnitude,
          location_lat: event.location_lat,
          location_lon: event.location_lon,
          response_status: "detected",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fall-events"] });
    },
  });

  const triggerEmergency = useMutation({
    mutationFn: async (fallEventId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get emergency contacts
      const { data: contacts } = await supabase
        .from("emergency_contacts")
        .select("*")
        .eq("user_id", user.id)
        .eq("notify_on_fall", true);

      // Update fall event status
      await supabase
        .from("fall_events")
        .update({
          response_status: "emergency_triggered",
          emergency_contacts_notified: contacts?.map(c => ({
            contact_id: c.id,
            notified_at: new Date().toISOString(),
            method: "push"
          })) || []
        })
        .eq("id", fallEventId);

      // Call edge function to send notifications
      await supabase.functions.invoke("trigger-emergency-response", {
        body: { userId: user.id, fallEventId, type: "fall" }
      });

      return true;
    },
    onSuccess: () => {
      toast.error("Emergency contacts have been notified", {
        description: "Help is on the way"
      });
    },
  });

  const confirmOk = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update the most recent fall event
      const { data: recentEvent } = await supabase
        .from("fall_events")
        .select("id")
        .eq("user_id", user.id)
        .eq("response_status", "detected")
        .order("detected_at", { ascending: false })
        .limit(1)
        .single();

      if (recentEvent) {
        await supabase
          .from("fall_events")
          .update({
            response_status: "user_confirmed_ok",
            user_response_at: new Date().toISOString()
          })
          .eq("id", recentEvent.id);
      }

      return true;
    },
    onSuccess: () => {
      setFallDetected(false);
      setCountdown(COUNTDOWN_SECONDS);
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
      }
      toast.success("Glad you're okay!");
    },
  });

  const handleFallDetected = useCallback(async (magnitude: number) => {
    haptic("heavy");
    setFallDetected(true);
    
    // Get location if available
    let location: { lat?: number; lon?: number } = {};
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      location = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
      };
    } catch (e) {
      console.log("Could not get location");
    }

    // Log the fall event
    const severity = magnitude > 5 ? "severe" : magnitude > 4 ? "moderate" : "minor";
    logFallEvent.mutate({
      severity,
      acceleration_magnitude: magnitude,
      location_lat: location.lat,
      location_lon: location.lon
    });

    // Start countdown
    setCountdown(COUNTDOWN_SECONDS);
    countdownTimer.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimer.current) {
            clearInterval(countdownTimer.current);
          }
          // Auto-trigger emergency
          triggerEmergency.mutate("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [logFallEvent, triggerEmergency]);

  // Device motion handler
  useEffect(() => {
    if (!isEnabled || !isSupported) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      // Calculate total acceleration magnitude
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2) / 9.81; // Convert to g
      setCurrentAcceleration(magnitude);

      // Store history for pattern detection
      accelerationHistory.current.push(magnitude);
      if (accelerationHistory.current.length > 50) {
        accelerationHistory.current.shift();
      }

      // Detect potential fall: high acceleration followed by stillness
      if (magnitude > FALL_THRESHOLD && !fallDetected) {
        lastHighAcceleration.current = magnitude;
        
        // Start monitoring for stillness
        if (stillnessTimer.current) {
          clearTimeout(stillnessTimer.current);
        }
        
        stillnessTimer.current = setTimeout(() => {
          // Check if device has been relatively still
          const recentReadings = accelerationHistory.current.slice(-10);
          const avgRecent = recentReadings.reduce((a, b) => a + b, 0) / recentReadings.length;
          const variance = recentReadings.reduce((sum, val) => sum + (val - avgRecent) ** 2, 0) / recentReadings.length;
          
          if (variance < STILLNESS_THRESHOLD && !fallDetected) {
            handleFallDetected(lastHighAcceleration.current);
          }
        }, STILLNESS_DURATION);
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      if (stillnessTimer.current) clearTimeout(stillnessTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [isEnabled, isSupported, fallDetected, handleFallDetected]);

  const toggleFallDetection = async () => {
    const newValue = !isEnabled;
    
    // Request permission on iOS if needed
    if (newValue && typeof (DeviceMotionEvent as any).requestPermission === "function") {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        if (permission !== "granted") {
          toast.error("Motion sensor permission denied");
          return;
        }
      } catch (e) {
        console.error("Permission error:", e);
      }
    }

    setIsEnabled(newValue);
    
    // Save to profile
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ fall_detection_enabled: newValue })
        .eq("id", user.id);
    }

    toast.success(newValue ? "Fall detection enabled" : "Fall detection disabled");
  };

  if (!isSupported) {
    return null; // Don't show on devices without motion sensors
  }

  return (
    <>
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-orange-500" />
              Fall Detection
            </span>
            <Switch checked={isEnabled} onCheckedChange={toggleFallDetection} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500 animate-pulse" />
                <span className="text-sm text-muted-foreground">Monitoring active</span>
              </div>
              <div className="text-xs text-muted-foreground">
                If a fall is detected, you'll have 30 seconds to confirm you're OK before emergency contacts are notified.
              </div>
              {process.env.NODE_ENV === "development" && (
                <div className="text-xs text-muted-foreground">
                  Current acceleration: {currentAcceleration.toFixed(2)}g
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Enable to automatically detect falls and alert emergency contacts
            </p>
          )}
        </CardContent>
      </Card>

      {/* Fall Detected Dialog */}
      <Dialog open={fallDetected} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-6 w-6 animate-pulse" />
              Fall Detected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="text-center">
              <div className="text-6xl font-bold text-destructive mb-2">{countdown}</div>
              <p className="text-muted-foreground">seconds until emergency contacts are notified</p>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full h-16 text-lg gap-2"
                variant="outline"
                onClick={() => confirmOk.mutate()}
              >
                <Check className="h-6 w-6" />
                I'm OK
              </Button>

              <Button
                className="w-full h-12 gap-2"
                variant="destructive"
                onClick={() => {
                  if (countdownTimer.current) {
                    clearInterval(countdownTimer.current);
                  }
                  triggerEmergency.mutate("");
                }}
              >
                <Phone className="h-5 w-5" />
                Get Help Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
