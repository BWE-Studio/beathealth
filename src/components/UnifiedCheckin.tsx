import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Sun, Moon, Heart, Droplet, Pill, Brain, Users, Check, ArrowRight, ArrowLeft, Camera, Zap, Footprints } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import confetti from "canvas-confetti";
import { SmartDeviceCapture } from "./SmartDeviceCapture";
import { useLanguage } from "@/contexts/LanguageContext";

interface UnifiedCheckinProps {
  isOpen: boolean;
  onClose: () => void;
  type?: "morning" | "evening" | "auto";
  initialShortcut?: "bp" | "sugar" | "sleep" | "steps";
}

const SLEEP_QUALITY_OPTIONS = ["excellent", "good", "fair", "poor", "very_poor"] as const;
const MOOD_OPTIONS = [
  { value: 1, emoji: "😢", label: "Low" },
  { value: 2, emoji: "😕", label: "Below Average" },
  { value: 3, emoji: "😐", label: "Neutral" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😊", label: "Great" },
];

const LONELINESS_OPTIONS = [
  { value: 1, label: "Not at all", emoji: "😊" },
  { value: 2, label: "A little", emoji: "😐" },
  { value: 3, label: "Somewhat", emoji: "😕" },
  { value: 4, label: "Very", emoji: "😢" },
];

type HeartScoreRecord = {
  user_id: string;
  score_date: string;
  [key: string]: unknown;
};

const upsertHistoryScore = (history: HeartScoreRecord[] | undefined, score: HeartScoreRecord) => {
  const existing = history ?? [];
  const withoutCurrentDate = existing.filter((item) => item.score_date !== score.score_date);
  return [score, ...withoutCurrentDate].sort((a, b) => b.score_date.localeCompare(a.score_date));
};

const formatSupabaseError = (error: unknown) => {
  if (!error || typeof error !== "object") return String(error);

  const maybeError = error as {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
    status?: number;
  };

  return [
    maybeError.code && `code=${maybeError.code}`,
    maybeError.status && `status=${maybeError.status}`,
    maybeError.message && `message=${maybeError.message}`,
    maybeError.details && `details=${maybeError.details}`,
    maybeError.hint && `hint=${maybeError.hint}`,
  ].filter(Boolean).join(" | ");
};

const traceJson = (value: unknown) => JSON.stringify(
  value,
  (_key, item) => {
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        stack: item.stack,
      };
    }
    return item;
  },
  2
);

const logTrace = (label: string, value: unknown) => {
  if (!import.meta.env.DEV) return;
  console.log(`${label}\n${traceJson(value)}`);
};

const throwCheckinError = (stepName: string, error: unknown) => {
  const details = formatSupabaseError(error);
  console.error(`[UnifiedCheckin] ${stepName} failed\n${traceJson({
    stepName,
    details,
    error,
  })}`);
  throw new Error(details ? `${stepName} failed: ${details}` : `${stepName} failed`);
};

export const UnifiedCheckin = ({ isOpen, onClose, type = "auto", initialShortcut }: UnifiedCheckinProps) => {
  const queryClient = useQueryClient();
  const { language, t } = useLanguage();
  
  // Determine ritual type based on time if auto
  const getAutoType = () => {
    const hour = new Date().getHours();
    return hour < 14 ? "morning" : "evening";
  };
  
  const ritualType = type === "auto" ? getAutoType() : type;
  const isMorning = ritualType === "morning";

  // Form state
  const [step, setStep] = useState(1);
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [fastingSugar, setFastingSugar] = useState("");
  const [stepsCount, setStepsCount] = useState("");
  const [sleepQuality, setSleepQuality] = useState<string>("");
  const [medsTaken, setMedsTaken] = useState<boolean | null>(null);
  const [moodScore, setMoodScore] = useState<number>(3);
  const [socialInteractions, setSocialInteractions] = useState<number>(0);
  const [leftHome, setLeftHome] = useState<boolean | null>(null);
  const [lonelinessScore, setLonelinessScore] = useState<number>(1);
  const [talkedToFamily, setTalkedToFamily] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [showOCR, setShowOCR] = useState(false);
  const [ocrDeviceType, setOcrDeviceType] = useState<"bp_monitor" | "glucose_meter" | "any">("any");
  const [vitalsMode, setVitalsMode] = useState<"all" | "bp" | "sugar">("all");

  // Morning: 5 steps (Vitals, Sleep, Social, Meds, Notes)
  // Evening: 6 steps (Vitals, Mood, Social, Meds, Activity, Notes)
  const totalSteps = isMorning ? 5 : 6;
  const progress = (step / totalSteps) * 100;

  useEffect(() => {
    if (!isOpen) return;

    if (initialShortcut === "sleep") {
      setStep(2);
      setVitalsMode("all");
      return;
    }

    if (initialShortcut === "steps") {
      setStep(5);
      setVitalsMode("all");
      return;
    }

    setStep(1);
    setVitalsMode(initialShortcut === "bp" || initialShortcut === "sugar" ? initialShortcut : "all");
  }, [isOpen, initialShortcut]);
  
  // Handle OCR reading
  const handleOCRReading = (reading: {
    systolic?: number;
    diastolic?: number;
    heart_rate?: number;
    glucose?: number;
  }) => {
    if (reading.systolic) setSystolic(reading.systolic.toString());
    if (reading.diastolic) setDiastolic(reading.diastolic.toString());
    if (reading.heart_rate) setHeartRate(reading.heart_rate.toString());
    if (reading.glucose) setFastingSugar(reading.glucose.toString());
    setShowOCR(false);
    haptic("success");
    toast.success(t("checkin.readingAutoFilled"));
  };

  const submitCheckin = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const traceId = `checkin-${Date.now()}`;

      logTrace("[CheckinTrace] Morning/Evening check-in start", {
        traceId,
        userId: user.id,
        ritualType,
        isMorning,
        today,
        measuredAt: now.toISOString(),
        inputs: {
          systolic,
          diastolic,
          heartRate,
          fastingSugar,
          stepsCount,
          sleepQuality,
          medsTaken,
          socialInteractions,
          moodScore,
          leftHome,
          lonelinessScore,
          talkedToFamily,
        },
      });

      // Log BP if provided
      if (systolic && diastolic) {
        const bpPayload = {
          user_id: user.id,
          systolic: parseInt(systolic),
          diastolic: parseInt(diastolic),
          heart_rate: heartRate ? parseInt(heartRate) : null,
          measured_at: now.toISOString(),
          ritual_type: ritualType,
        };
        logTrace("[CheckinTrace] BP insert request", { traceId, bpPayload });
        const { data: bpData, error: bpError } = await supabase.from("bp_logs").insert(bpPayload).select("*").single();
        logTrace("[CheckinTrace] BP insert response", { traceId, insertedRow: bpData, error: bpError });
        if (bpError) throwCheckinError("BP log insert", bpError);
      }

      // Log sugar if provided (morning only)
      if (isMorning && fastingSugar) {
        const sugarPayload = {
          user_id: user.id,
          glucose_mg_dl: parseInt(fastingSugar),
          measurement_type: "fasting",
          measured_at: now.toISOString(),
          ritual_type: ritualType,
        };
        logTrace("[CheckinTrace] Sugar insert request", { traceId, sugarPayload });
        const { data: sugarData, error: sugarError } = await supabase.from("sugar_logs").insert(sugarPayload).select("*").single();
        logTrace("[CheckinTrace] Sugar insert response", { traceId, insertedRow: sugarData, error: sugarError });
        if (sugarError) throwCheckinError("Sugar log insert", sugarError);
      }

      // Log behavior
      if (!isMorning && stepsCount) {
        const stepsValue = parseInt(stepsCount);
        if (Number.isNaN(stepsValue) || stepsValue < 0 || stepsValue > 100000) {
          throw new Error("Steps count must be between 0 and 100,000");
        }
      }

      const behaviorPayload = {
        user_id: user.id,
        log_date: today,
        ritual_type: ritualType,
        steps_count: !isMorning && stepsCount ? parseInt(stepsCount) : null,
        sleep_quality: (sleepQuality || null) as "excellent" | "good" | "fair" | "poor" | "very_poor" | null,
        meds_taken: medsTaken,
        notes: notes || null,
        loneliness_score: lonelinessScore,
        social_interaction_count: socialInteractions,
      };
      logTrace("[CheckinTrace] Behavior insert request", { traceId, behaviorPayload });
      const { data: behaviorData, error: behaviorError } = await supabase.from("behavior_logs").insert([behaviorPayload]).select("*").single();
      logTrace("[CheckinTrace] Behavior insert response", { traceId, insertedRow: behaviorData, error: behaviorError });
      if (behaviorError) throwCheckinError("Behavior log insert", behaviorError);

      // Log social wellness for both morning and evening
      const { data: existing, error: existingSocialError } = await supabase
        .from("social_wellness_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("log_date", today)
        .maybeSingle();
      logTrace("[CheckinTrace] Social wellness lookup response", {
        traceId,
        query: { table: "social_wellness_logs", userId: user.id, logDate: today },
        data: existing,
        error: existingSocialError,
      });
      if (existingSocialError) throwCheckinError("Social wellness lookup", existingSocialError);

      const socialData = {
        social_interactions: socialInteractions,
        mood_score: moodScore,
        left_home: leftHome,
        loneliness_score: lonelinessScore,
        interaction_types: talkedToFamily ? ['family'] : [],
      };

      if (existing) {
        logTrace("[CheckinTrace] Social wellness update request", { traceId, id: existing.id, socialData });
        const { data: socialUpdateData, error: socialUpdateError } = await supabase.from("social_wellness_logs").update(socialData).eq("id", existing.id).select("*").single();
        logTrace("[CheckinTrace] Social wellness update response", { traceId, updatedRow: socialUpdateData, error: socialUpdateError });
        if (socialUpdateError) throwCheckinError("Social wellness update", socialUpdateError);
      } else {
        const socialInsertPayload = {
          user_id: user.id,
          log_date: today,
          ...socialData,
        };
        logTrace("[CheckinTrace] Social wellness insert request", { traceId, socialInsertPayload });
        const { data: socialInsertData, error: socialInsertError } = await supabase.from("social_wellness_logs").insert(socialInsertPayload).select("*").single();
        logTrace("[CheckinTrace] Social wellness insert response", { traceId, insertedRow: socialInsertData, error: socialInsertError });
        if (socialInsertError) throwCheckinError("Social wellness insert", socialInsertError);
      }

      // Update streak
      logTrace("[CheckinTrace] Streak RPC request", { traceId, p_user_id: user.id, p_type: "daily_checkin" });
      const { error: streakError } = await supabase.rpc("update_or_create_streak", {
        p_user_id: user.id,
        p_type: "daily_checkin",
      });
      logTrace("[CheckinTrace] Streak RPC response", { traceId, error: streakError });
      if (streakError) throwCheckinError("Daily check-in streak update", streakError);

      // Calculate heart score
      logTrace("[CheckinTrace] calculate-heart-score invoke request", {
        traceId,
        body: { date: today },
      });
      const { data: scoreData, error: scoreError } = await supabase.functions.invoke("calculate-heart-score", {
        body: { date: today },
      });
      logTrace("[CheckinTrace] calculate-heart-score invoke response", {
        traceId,
        response: scoreData,
        heartScore: scoreData?.heartScore?.heart_score,
        bpScore: scoreData?.heartScore?.bp_score,
        sugarScore: scoreData?.heartScore?.sugar_score,
        returnedRow: scoreData?.heartScore,
        error: scoreError,
      });
      if (scoreError) throwCheckinError("HeartScore calculation", scoreError);
      if (scoreData?.success === false) {
        throwCheckinError("HeartScore calculation", scoreData);
      }

      return { userId: user.id, heartScore: scoreData?.heartScore as HeartScoreRecord | undefined };
    },
    onSuccess: ({ userId, heartScore }) => {
      logTrace("[CheckinTrace] Check-in mutation success", {
        userId,
        heartScore,
        invalidations: [
          ["rituals", userId],
          ["ritual-status"],
          ["streaks", userId],
          ["social-wellness", "weekly"],
        ],
        cacheWrites: heartScore?.user_id
          ? [
              ["heartScore", "today", heartScore.user_id],
              ["heartScore", "history", heartScore.user_id],
            ]
          : [
              ["heartScore", "today", userId],
              ["heartScore", "history", userId],
            ],
      });
      queryClient.invalidateQueries({ queryKey: ["rituals", userId] });
      queryClient.invalidateQueries({ queryKey: ["ritual-status"] });
      queryClient.invalidateQueries({ queryKey: ["streaks", userId] });
      queryClient.invalidateQueries({ queryKey: ["social-wellness", "weekly"] });
      if (heartScore?.user_id) {
        queryClient.setQueryData(["heartScore", "today", heartScore.user_id], heartScore);
        queryClient.setQueryData<HeartScoreRecord[] | undefined>(
          ["heartScore", "history", heartScore.user_id],
          (history) => upsertHistoryScore(history, heartScore)
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["heartScore", "today", userId] });
        queryClient.invalidateQueries({ queryKey: ["heartScore", "history", userId] });
      }

      // Celebration
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      haptic("success");
      toast.success(isMorning ? t("checkin.morningComplete") : t("checkin.eveningComplete"));
      
      // Reset and close
      resetForm();
      onClose();
    },
    onError: (error) => {
      console.error(`[UnifiedCheckin] Check-in failed\n${traceJson(error)}`);
      toast.error(t("checkin.failed"), {
        description: error instanceof Error ? error.message : t("checkin.tryAgain"),
      });
    },
  });

  const resetForm = () => {
    setStep(1);
    setSystolic("");
    setDiastolic("");
    setHeartRate("");
    setFastingSugar("");
    setStepsCount("");
    setSleepQuality("");
    setMedsTaken(null);
    setMoodScore(3);
    setSocialInteractions(0);
    setLeftHome(null);
    setLonelinessScore(1);
    setTalkedToFamily(null);
    setNotes("");
  };

  const canProceed = () => {
    // All steps are optional for senior-friendly UX
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps) {
      haptic("light");
      setStep(step + 1);
    } else {
      submitCheckin.mutate();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      haptic("light");
      setStep(step - 1);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            {isMorning ? <Sun className="h-5 w-5 text-orange-500" /> : <Moon className="h-5 w-5 text-indigo-500" />}
            {isMorning ? t("checkin.morningTitle") : t("checkin.eveningTitle")}
          </SheetTitle>
          <Progress value={progress} className="h-2" />
        </SheetHeader>

        <div className="space-y-6 py-4 overflow-y-auto max-h-[calc(85vh-150px)]">
          {/* Step 1: Vitals */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center mb-4">
                <Heart className="h-10 w-10 text-red-500 mx-auto mb-2" />
                <h3 className="text-lg font-semibold">
                  {vitalsMode === "sugar"
                    ? t("checkin.randomSugar")
                    : t("checkin.bloodPressure")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {vitalsMode === "sugar"
                    ? t("checkin.enterSugarOptional")
                    : t("checkin.enterBpOptional")}
                </p>
              </div>

              {/* Quick Camera OCR Button */}
              {vitalsMode !== "sugar" && (
                <button
                  onClick={() => {
                    haptic("light");
                    setOcrDeviceType("bp_monitor");
                    setShowOCR(true);
                  }}
                  className="w-full p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 flex items-center gap-3 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      {t("checkin.autoFillPhoto")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("checkin.bpPhotoHelp")}
                    </p>
                  </div>
                </button>
              )}

              {/* OCR Modal */}
              {showOCR && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <div className="bg-background rounded-2xl p-4 w-full max-w-md">
                    <SmartDeviceCapture
                      deviceType={ocrDeviceType}
                      onReadingCaptured={handleOCRReading}
                      onClose={() => setShowOCR(false)}
                    />
                    <Button 
                      variant="ghost" 
                      className="w-full mt-2" 
                      onClick={() => setShowOCR(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              )}

              {vitalsMode !== "sugar" && (
                <div className="relative flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {t("checkin.orManual")}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              {vitalsMode !== "sugar" && (
                <div className="rounded-2xl border border-border/50 bg-card/50 p-4 space-y-4">
                  <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-4">
                    <div className="flex min-w-0 flex-col gap-2">
                      <Label htmlFor="checkin-systolic" className="block px-1 text-xs leading-5 text-muted-foreground">
                        {t("checkin.systolicShort")}
                      </Label>
                      <Input
                        id="checkin-systolic"
                        type="number"
                        placeholder="120"
                        value={systolic}
                        onChange={(e) => setSystolic(e.target.value)}
                        className="h-11 text-center text-lg placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <Label htmlFor="checkin-diastolic" className="block px-1 text-xs leading-5 text-muted-foreground">
                        {t("checkin.diastolicShort")}
                      </Label>
                      <Input
                        id="checkin-diastolic"
                        type="number"
                        placeholder="80"
                        value={diastolic}
                        onChange={(e) => setDiastolic(e.target.value)}
                        className="h-11 text-center text-lg placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="checkin-heart-rate" className="block px-1 text-xs leading-5 text-muted-foreground">
                      {t("checkin.heartRateOptional")}
                    </Label>
                    <Input
                      id="checkin-heart-rate"
                      type="number"
                      placeholder="72"
                      value={heartRate}
                      onChange={(e) => setHeartRate(e.target.value)}
                      className="h-10 text-center placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
              )}

              {isMorning && vitalsMode !== "bp" && (
                <div className={`rounded-2xl border border-border/50 bg-card/50 p-3 space-y-3 ${vitalsMode === "all" ? "mt-1" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Droplet className="h-5 w-5 text-blue-500" />
                      <Label className="block text-sm leading-none">{t("checkin.fastingBloodSugar")}</Label>
                    </div>
                    <button
                      onClick={() => {
                        haptic("light");
                        setOcrDeviceType("glucose_meter");
                        setShowOCR(true);
                      }}
                      className="text-xs text-primary flex items-center gap-1"
                    >
                      <Camera className="w-3 h-3" />
                      {t("checkin.scan")}
                    </button>
                  </div>
                  <Input
                    type="number"
                    placeholder="100"
                    value={fastingSugar}
                    onChange={(e) => setFastingSugar(e.target.value)}
                    className="h-11 text-center text-lg placeholder:text-muted-foreground/50"
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 2: Sleep (Morning) or Mood (Evening) */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              {isMorning ? (
                <>
                  <div className="text-center mb-6">
                    <Moon className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">{t("checkin.sleepQuestion")}</h3>
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {SLEEP_QUALITY_OPTIONS.map((quality) => (
                      <button
                        key={quality}
                        onClick={() => setSleepQuality(quality)}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          sleepQuality === quality
                            ? "border-primary bg-primary/10"
                            : "border-border/50 hover:border-primary/30"
                        }`}
                      >
                        <span className="text-2xl">
                          {quality === "excellent" ? "😴" : 
                           quality === "good" ? "😊" : 
                           quality === "fair" ? "😐" : 
                           quality === "poor" ? "😩" : "😵"}
                        </span>
                        <p className="text-xs mt-1 capitalize">{t(`checkin.${quality === "very_poor" ? "veryPoor" : quality}`)}</p>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <Brain className="h-12 w-12 text-purple-500 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">{t("checkin.feelingQuestion")}</h3>
                  </div>

                  <div className="flex justify-between px-4">
                    {MOOD_OPTIONS.map((mood) => (
                      <button
                        key={mood.value}
                        onClick={() => setMoodScore(mood.value)}
                        className={`p-4 rounded-xl transition-all ${
                          moodScore === mood.value
                            ? "bg-primary/10 ring-2 ring-primary scale-110"
                            : "hover:bg-muted"
                        }`}
                      >
                        <span className="text-3xl">{mood.emoji}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Social Wellness (Both Morning & Evening) */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-6">
                <Users className="h-12 w-12 text-pink-500 mx-auto mb-2" />
                <h3 className="text-lg font-semibold">{t("checkin.socialConnection")}</h3>
                <p className="text-sm text-muted-foreground">{t("checkin.connectedQuestion")}</p>
              </div>

              <div className="space-y-4">
                {/* Talked to family */}
                <div className="p-4 rounded-xl border border-border/50 bg-card">
                  <p className="font-medium mb-3">{t("checkin.talkedQuestion")}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setTalkedToFamily(true)}
                      className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                        talkedToFamily === true 
                          ? "bg-green-500 text-white" 
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      {t("checkin.yes")} 😊
                    </button>
                    <button
                      onClick={() => setTalkedToFamily(false)}
                      className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                        talkedToFamily === false 
                          ? "bg-muted-foreground text-white" 
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      {t("checkin.no")}
                    </button>
                  </div>
                </div>

                {/* Loneliness check */}
                <div className="p-4 rounded-xl border border-border/50 bg-card">
                  <p className="font-medium mb-3">{t("checkin.lonelyQuestion")}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {LONELINESS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setLonelinessScore(option.value)}
                        className={`p-3 rounded-xl transition-all text-center ${
                          lonelinessScore === option.value
                            ? "bg-primary text-primary-foreground ring-2 ring-primary"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        <span className="text-2xl block mb-1">{option.emoji}</span>
                        <span className="text-xs">
                          {option.value === 1
                            ? t("checkin.lonelyNotAtAll")
                            : option.value === 2
                            ? t("checkin.lonelyALittle")
                            : option.value === 3
                            ? t("checkin.lonelySomewhat")
                            : t("checkin.lonelyVery")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Left home (evening only shown here too for consistency) */}
                {!isMorning && (
                  <div className="p-4 rounded-xl border border-border/50 bg-card">
                    <p className="font-medium mb-3">{t("checkin.outsideQuestion")}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setLeftHome(true)}
                        className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                          leftHome === true 
                            ? "bg-green-500 text-white" 
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        {t("checkin.yes")} ☀️
                      </button>
                      <button
                        onClick={() => setLeftHome(false)}
                        className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                          leftHome === false 
                            ? "bg-muted-foreground text-white" 
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        {t("checkin.no")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Medications */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-6">
                <Pill className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <h3 className="text-lg font-semibold">
                  {isMorning ? t("checkin.morningMedsQuestion") : t("checkin.eveningMedsQuestion")}
                </h3>
              </div>

              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setMedsTaken(true)}
                  className={`flex-1 max-w-[160px] p-8 rounded-2xl border-2 transition-all ${
                    medsTaken === true
                      ? "border-green-500 bg-green-500/10"
                      : "border-border/50 hover:border-green-500/50"
                  }`}
                >
                  <Check className={`h-10 w-10 mx-auto mb-2 ${medsTaken === true ? "text-green-500" : "text-muted-foreground"}`} />
                  <p className="font-medium text-lg">{t("checkin.yes")}</p>
                </button>
                <button
                  onClick={() => setMedsTaken(false)}
                  className={`flex-1 max-w-[160px] p-8 rounded-2xl border-2 transition-all ${
                    medsTaken === false
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-border/50 hover:border-orange-500/50"
                  }`}
                >
                  <span className={`text-3xl block mb-2 ${medsTaken === false ? "" : "opacity-50"}`}>⏳</span>
                  <p className="font-medium text-lg">{t("checkin.notYet")}</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Notes (Morning) or Steps (Evening) */}
          {step === 5 && (
            <div className="space-y-6 animate-fade-in">
              {isMorning ? (
                <>
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold">{t("checkin.notesToday")}</h3>
                    <p className="text-sm text-muted-foreground">{t("checkin.notesTodaySubtitle")}</p>
                  </div>
                  <textarea
                    className="w-full h-32 p-4 rounded-xl border border-border/50 bg-background resize-none text-base"
                    placeholder={t("checkin.notesTodayPlaceholder")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <Footprints className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">
                      {t("checkin.stepsCount")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("checkin.enterSteps")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("checkin.stepsCount")}</Label>
                    <Input
                      type="number"
                      placeholder="5000"
                      value={stepsCount}
                      onChange={(e) => setStepsCount(e.target.value)}
                      className="text-center text-xl"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {t("checkin.steps")}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 6: Notes (Evening only) */}
          {step === 6 && !isMorning && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold">{t("checkin.notesDay")}</h3>
                <p className="text-sm text-muted-foreground">{t("checkin.notesDaySubtitle")}</p>
              </div>
              <textarea
                className="w-full h-32 p-4 rounded-xl border border-border/50 bg-background resize-none text-base"
                placeholder={t("checkin.notesDayPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-4 border-t">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("checkin.back")}
            </Button>
          )}
          <Button 
            className="flex-1 gap-2" 
            onClick={handleNext}
            disabled={submitCheckin.isPending}
          >
            {step === totalSteps ? (
              <>
                <Check className="h-4 w-4" />
                {t("checkin.complete")}
              </>
            ) : (
              <>
                {canProceed() ? t("checkin.next") : t("common.skip")}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
