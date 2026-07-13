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

export const UnifiedCheckin = ({ isOpen, onClose, type = "auto", initialShortcut }: UnifiedCheckinProps) => {
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  
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
    toast.success(language === "hi" ? "रीडिंग ऑटो-भरी गई!" : "Reading auto-filled!");
  };

  const submitCheckin = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // Log BP if provided
      if (systolic && diastolic) {
        await supabase.from("bp_logs").insert({
          user_id: user.id,
          systolic: parseInt(systolic),
          diastolic: parseInt(diastolic),
          heart_rate: heartRate ? parseInt(heartRate) : null,
          measured_at: now.toISOString(),
          ritual_type: ritualType,
        });
      }

      // Log sugar if provided (morning only)
      if (isMorning && fastingSugar) {
        await supabase.from("sugar_logs").insert({
          user_id: user.id,
          glucose_mg_dl: parseInt(fastingSugar),
          measurement_type: "fasting",
          measured_at: now.toISOString(),
          ritual_type: ritualType,
        });
      }

      // Log behavior
      if (!isMorning && stepsCount) {
        const stepsValue = parseInt(stepsCount);
        if (Number.isNaN(stepsValue) || stepsValue < 0 || stepsValue > 100000) {
          throw new Error("Steps count must be between 0 and 100,000");
        }
      }

      await supabase.from("behavior_logs").insert([{
        user_id: user.id,
        log_date: today,
        ritual_type: ritualType,
        steps_count: !isMorning && stepsCount ? parseInt(stepsCount) : null,
        sleep_quality: (sleepQuality || null) as "excellent" | "good" | "fair" | "poor" | "very_poor" | null,
        meds_taken: medsTaken,
        notes: notes || null,
        loneliness_score: lonelinessScore,
        social_interaction_count: socialInteractions,
      }]);

      // Log social wellness for both morning and evening
      const { data: existing } = await supabase
        .from("social_wellness_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("log_date", today)
        .maybeSingle();

      const socialData = {
        social_interactions: socialInteractions,
        mood_score: moodScore,
        left_home: leftHome,
        loneliness_score: lonelinessScore,
        interaction_types: talkedToFamily ? ['family'] : [],
      };

      if (existing) {
        await supabase.from("social_wellness_logs").update(socialData).eq("id", existing.id);
      } else {
        await supabase.from("social_wellness_logs").insert({
          user_id: user.id,
          log_date: today,
          ...socialData,
        });
      }

      // Update streak
      await supabase.rpc("update_or_create_streak", {
        p_user_id: user.id,
        p_type: ritualType,
      });

      // Calculate heart score
      await supabase.functions.invoke("calculate-heart-score", {
        body: { userId: user.id },
      });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rituals"] });
      queryClient.invalidateQueries({ queryKey: ["ritual-status"] });
      queryClient.invalidateQueries({ queryKey: ["heart-score"] });
      queryClient.invalidateQueries({ queryKey: ["streaks"] });
      queryClient.invalidateQueries({ queryKey: ["social-wellness"] });

      // Celebration
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      haptic("success");
      toast.success(`${isMorning ? "Morning" : "Evening"} check-in complete! 🎉`);
      
      // Reset and close
      resetForm();
      onClose();
    },
    onError: (error) => {
      console.error("Check-in error:", error);
      toast.error("Failed to save check-in");
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
            {isMorning ? "Morning" : "Evening"} Check-in
          </SheetTitle>
          <Progress value={progress} className="h-2" />
        </SheetHeader>

        <div className="space-y-6 py-4 overflow-y-auto max-h-[calc(85vh-150px)]">
          {/* Step 1: Vitals */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center mb-4">
                <Heart className="h-12 w-12 text-red-500 mx-auto mb-2" />
                <h3 className="text-lg font-semibold">
                  {vitalsMode === "sugar"
                    ? (language === "hi" ? "ब्लड शुगर" : "Blood Sugar")
                    : (language === "hi" ? "ब्लड प्रेशर" : "Blood Pressure")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {vitalsMode === "sugar"
                    ? (language === "hi" ? "अपनी शुगर रीडिंग दर्ज करें (वैकल्पिक)" : "Enter your sugar reading (optional)")
                    : (language === "hi" ? "अपनी BP रीडिंग दर्ज करें (वैकल्पिक)" : "Enter your BP reading (optional)")}
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
                  className="w-full p-4 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 flex items-center gap-4 active:scale-[0.98] transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      {language === "hi" ? "फोटो से ऑटो-भरें" : "Auto-fill from Photo"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === "hi" ? "BP मॉनिटर की फोटो लें" : "Take a photo of your BP monitor"}
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
                      {language === "hi" ? "रद्द करें" : "Cancel"}
                    </Button>
                  </div>
                </div>
              )}

              {vitalsMode !== "sugar" && (
                <div className="relative flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {language === "hi" ? "या मैन्युअली दर्ज करें" : "or enter manually"}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              {vitalsMode !== "sugar" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{language === "hi" ? "सिस्टोलिक (ऊपर)" : "Systolic (top)"}</Label>
                    <Input
                      type="number"
                      placeholder="120"
                      value={systolic}
                      onChange={(e) => setSystolic(e.target.value)}
                      className="text-center text-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "hi" ? "डायस्टोलिक (नीचे)" : "Diastolic (bottom)"}</Label>
                    <Input
                      type="number"
                      placeholder="80"
                      value={diastolic}
                      onChange={(e) => setDiastolic(e.target.value)}
                      className="text-center text-xl"
                    />
                  </div>
                </div>
              )}

              {vitalsMode !== "sugar" && (
                <div className="space-y-2">
                  <Label>{language === "hi" ? "हृदय गति (वैकल्पिक)" : "Heart Rate (optional)"}</Label>
                  <Input
                    type="number"
                    placeholder="72"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    className="text-center"
                  />
                </div>
              )}

              {isMorning && vitalsMode !== "bp" && (
                <div className={`space-y-4 ${vitalsMode === "all" ? "pt-4 border-t" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Droplet className="h-5 w-5 text-blue-500" />
                      <Label>{language === "hi" ? "फास्टिंग शुगर (mg/dL)" : "Fasting Blood Sugar (mg/dL)"}</Label>
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
                      {language === "hi" ? "स्कैन" : "Scan"}
                    </button>
                  </div>
                  <Input
                    type="number"
                    placeholder="100"
                    value={fastingSugar}
                    onChange={(e) => setFastingSugar(e.target.value)}
                    className="text-center text-xl"
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
                    <h3 className="text-lg font-semibold">How did you sleep?</h3>
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
                        <p className="text-xs mt-1 capitalize">{quality.replace("_", " ")}</p>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <Brain className="h-12 w-12 text-purple-500 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">How are you feeling?</h3>
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
                <h3 className="text-lg font-semibold">Social Connection</h3>
                <p className="text-sm text-muted-foreground">How connected do you feel?</p>
              </div>

              <div className="space-y-4">
                {/* Talked to family */}
                <div className="p-4 rounded-xl border border-border/50 bg-card">
                  <p className="font-medium mb-3">Did you talk to family or friends?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setTalkedToFamily(true)}
                      className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                        talkedToFamily === true 
                          ? "bg-green-500 text-white" 
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      Yes 😊
                    </button>
                    <button
                      onClick={() => setTalkedToFamily(false)}
                      className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                        talkedToFamily === false 
                          ? "bg-muted-foreground text-white" 
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Loneliness check */}
                <div className="p-4 rounded-xl border border-border/50 bg-card">
                  <p className="font-medium mb-3">Feeling lonely?</p>
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
                        <span className="text-xs">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Left home (evening only shown here too for consistency) */}
                {!isMorning && (
                  <div className="p-4 rounded-xl border border-border/50 bg-card">
                    <p className="font-medium mb-3">Did you step outside today?</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setLeftHome(true)}
                        className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                          leftHome === true 
                            ? "bg-green-500 text-white" 
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        Yes ☀️
                      </button>
                      <button
                        onClick={() => setLeftHome(false)}
                        className={`flex-1 py-4 rounded-xl text-lg font-medium transition-all ${
                          leftHome === false 
                            ? "bg-muted-foreground text-white" 
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        No
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
                  {isMorning ? "Morning medications?" : "Evening medications?"}
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
                  <p className="font-medium text-lg">Yes</p>
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
                  <p className="font-medium text-lg">Not yet</p>
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
                    <h3 className="text-lg font-semibold">Any notes for today?</h3>
                    <p className="text-sm text-muted-foreground">Optional - add any thoughts</p>
                  </div>
                  <textarea
                    className="w-full h-32 p-4 rounded-xl border border-border/50 bg-background resize-none text-base"
                    placeholder="How are you feeling today?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <Footprints className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <h3 className="text-lg font-semibold">
                      {language === "hi" ? "कदमों की गिनती" : "Steps Count"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {language === "hi" ? "आज के कदमों की संख्या दर्ज करें" : "Enter your steps count for today"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{language === "hi" ? "कदमों की गिनती" : "Steps Count"}</Label>
                    <Input
                      type="number"
                      placeholder="5000"
                      value={stepsCount}
                      onChange={(e) => setStepsCount(e.target.value)}
                      className="text-center text-xl"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {language === "hi" ? "कदम" : "steps"}
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
                <h3 className="text-lg font-semibold">Any notes about your day?</h3>
                <p className="text-sm text-muted-foreground">Optional - reflect on your day</p>
              </div>
              <textarea
                className="w-full h-32 p-4 rounded-xl border border-border/50 bg-background resize-none text-base"
                placeholder="How was your day?"
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
              Back
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
                Complete
              </>
            ) : (
              <>
                {canProceed() ? "Next" : "Skip"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
