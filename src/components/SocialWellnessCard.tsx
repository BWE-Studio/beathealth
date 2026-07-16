import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Users, Phone, Home, Smile, Frown, Meh, Heart, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { haptic } from "@/lib/haptics";
import { ThemedIcon, ThemedEmoji } from "./ThemedIcon";
import { useLanguage } from "@/contexts/LanguageContext";

interface SocialLog {
  id: string;
  user_id: string;
  log_date: string;
  social_interactions: number;
  interaction_types: string[];
  loneliness_score: number | null;
  mood_score: number | null;
  left_home: boolean | null;
  notes: string | null;
  created_at: string;
}

interface WellnessActivity {
  id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string | null;
  duration_minutes: number | null;
}

const INTERACTION_TYPES = [
  { value: "family_call", labelKey: "social.familyCall", emoji: "📞" },
  { value: "friend_visit", labelKey: "social.friendVisit", emoji: "👋" },
  { value: "community_event", labelKey: "social.communityEvent", emoji: "🎉" },
  { value: "religious_gathering", labelKey: "social.religiousGathering", emoji: "🙏" },
  { value: "neighbor_chat", labelKey: "social.neighborChat", emoji: "🏠" },
  { value: "video_call", labelKey: "social.videoCall", emoji: "📱" },
];

const MOOD_LEVELS = [
  { value: 1, icon: Frown, label: "Low", color: "text-red-500" },
  { value: 2, icon: Frown, label: "Below Average", color: "text-orange-500" },
  { value: 3, icon: Meh, label: "Neutral", color: "text-yellow-500" },
  { value: 4, icon: Smile, label: "Good", color: "text-green-400" },
  { value: 5, icon: Smile, label: "Great", color: "text-green-500" },
];

export const SocialWellnessCard = () => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [selectedInteractions, setSelectedInteractions] = useState<string[]>([]);
  const [moodScore, setMoodScore] = useState<number>(3);
  const [lonelinessScore, setLonelinessScore] = useState<number>(3);
  const [leftHome, setLeftHome] = useState<boolean>(false);
  const [notes, setNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());

  const { data: weeklyLogs, isLoading } = useQuery({
    queryKey: ["social-wellness", "weekly"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("social_wellness_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("log_date", format(weekStart, "yyyy-MM-dd"))
        .lte("log_date", format(weekEnd, "yyyy-MM-dd"))
        .order("log_date", { ascending: false });

      if (error) throw error;
      return data as SocialLog[];
    },
  });

  const { data: suggestedActivities } = useQuery({
    queryKey: ["wellness-activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wellness_activities")
        .select("*")
        .eq("category", "social")
        .eq("is_active", true)
        .limit(3);

      if (error) throw error;
      return data as WellnessActivity[];
    },
  });

  const logInteraction = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if log exists for today
      const { data: existing } = await supabase
        .from("social_wellness_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("log_date", today)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("social_wellness_logs")
          .update({
            social_interactions: selectedInteractions.length,
            interaction_types: selectedInteractions,
            mood_score: moodScore,
            loneliness_score: lonelinessScore,
            left_home: leftHome,
            notes: notes || null,
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("social_wellness_logs")
          .insert({
            user_id: user.id,
            log_date: today,
            social_interactions: selectedInteractions.length,
            interaction_types: selectedInteractions,
            mood_score: moodScore,
            loneliness_score: lonelinessScore,
            left_home: leftHome,
            notes: notes || null,
          });

        if (error) throw error;
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-wellness"] });
      setShowLogDialog(false);
      setSelectedInteractions([]);
      setNotes("");
      haptic("success");
      toast.success(t("social.logged"));
    },
    onError: (error) => {
      console.error("Error logging social wellness:", error);
      toast.error(t("social.logFailed"));
    },
  });

  const toggleInteraction = (value: string) => {
    setSelectedInteractions(prev => 
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  // Calculate weekly stats
  const totalInteractions = weeklyLogs?.reduce((sum, log) => sum + (log.social_interactions || 0), 0) || 0;
  const avgMood = weeklyLogs?.length 
    ? weeklyLogs.reduce((sum, log) => sum + (log.mood_score || 3), 0) / weeklyLogs.length 
    : 0;
  const daysLogged = weeklyLogs?.length || 0;
  const daysLeftHome = weeklyLogs?.filter(log => log.left_home).length || 0;

  const todayLog = weeklyLogs?.find(log => log.log_date === today);

  // Wellness score (0-100)
  const wellnessScore = Math.min(100, Math.round(
    (totalInteractions * 10) + (avgMood * 10) + (daysLeftHome * 10)
  ));

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-20 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <ThemedIcon icon={Users} size="sm" variant="primary" />
            {t("social.title")}
          </span>
          <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1">
                <Plus className="h-4 w-4" />
                {t("social.log")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("social.logTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Interaction Types */}
                <div className="space-y-2">
                  <Label>{t("social.interactionsToday")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {INTERACTION_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => toggleInteraction(type.value)}
                        className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2 ${
                          selectedInteractions.includes(type.value)
                            ? "border-primary bg-primary/10"
                            : "border-border/50 bg-background/50 hover:border-primary/50"
                        }`}
                      >
                        <ThemedEmoji emoji={type.emoji} size="md" />
                        <span className="text-sm font-medium">{t(type.labelKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mood Score */}
                <div className="space-y-2">
                  <Label>{t("social.moodToday")}</Label>
                  <div className="flex justify-between">
                    {MOOD_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setMoodScore(level.value)}
                        className={`p-2 rounded-lg transition-all ${
                          moodScore === level.value
                            ? "bg-primary/10 ring-2 ring-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <level.icon className={`h-6 w-6 ${level.color}`} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Connection Score */}
                <div className="space-y-2">
                  <Label>{t("social.connectedScale")}</Label>
                  <div className="flex justify-between">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        onClick={() => setLonelinessScore(value)}
                        className={`w-10 h-10 rounded-full transition-all ${
                          lonelinessScore === value
                            ? "bg-pink-500 text-white"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Left Home */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2">
                    <Home className="h-5 w-5 text-muted-foreground" />
                    <span>{t("social.outsideToday")}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={leftHome ? "default" : "outline"}
                      onClick={() => setLeftHome(true)}
                    >
                      {t("checkin.yes")}
                    </Button>
                    <Button
                      size="sm"
                      variant={!leftHome ? "default" : "outline"}
                      onClick={() => setLeftHome(false)}
                    >
                      {t("checkin.no")}
                    </Button>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{t("social.notesOptional")}</Label>
                  <Textarea
                    placeholder={t("social.notesPlaceholder")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <Button 
                  className="w-full" 
                  onClick={() => logInteraction.mutate()}
                >
                  {t("common.save")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Weekly Summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg bg-pink-500/10">
            <p className="text-2xl font-bold text-pink-500">{totalInteractions}</p>
            <p className="text-xs text-muted-foreground">{t("social.interactions")}</p>
          </div>
          <div className="p-2 rounded-lg bg-green-500/10">
            <p className="text-2xl font-bold text-green-500">{daysLeftHome}/7</p>
            <p className="text-xs text-muted-foreground">{t("social.daysOut")}</p>
          </div>
          <div className="p-2 rounded-lg bg-purple-500/10">
            <p className="text-2xl font-bold text-purple-500">{wellnessScore}</p>
            <p className="text-xs text-muted-foreground">{t("social.wellness")}</p>
          </div>
        </div>

        {/* Today's Status */}
        {todayLog ? (
          <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
            <div className="flex items-center gap-2 text-green-600">
              <Heart className="h-4 w-4" />
              <span className="text-sm">{t("social.loggedToday")}</span>
            </div>
            {todayLog.interaction_types && todayLog.interaction_types.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {todayLog.interaction_types.map((type) => {
                  const info = INTERACTION_TYPES.find(t => t.value === type);
                  return info ? (
                    <span key={type} className="text-sm">
                      {info.emoji}
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <p className="text-sm text-yellow-600">
              {t("social.notLoggedToday")}
            </p>
          </div>
        )}

        {/* Suggested Activities */}
        {suggestedActivities && suggestedActivities.length > 0 && wellnessScore < 50 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("social.suggested")}</p>
            {suggestedActivities.slice(0, 2).map((activity) => (
              <div 
                key={activity.id}
                className="p-2 rounded-lg bg-muted/30 text-sm"
              >
                {activity.title}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
