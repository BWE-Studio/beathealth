import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sun, Moon, TrendingUp, Users, MessageCircle, Flame, Pill, ShoppingBag, Trophy, Crown, Heart, Brain, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import HeartScoreCard from "@/components/HeartScoreCard";
import RitualProgress from "@/components/RitualProgress";
import { useLanguage } from "@/contexts/LanguageContext";
import { useStreaks } from "@/hooks/useStreaks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StreakCelebration } from "@/components/StreakCelebration";
import { useAchievements } from "@/hooks/useAchievements";
import { AchievementBadge } from "@/components/AchievementBadge";
import { InteractiveTutorial } from "@/components/InteractiveTutorial";
import { haptic } from "@/lib/haptics";
import { QuickLogActions } from "@/components/QuickLogActions";
import { DeviceQuickActions } from "@/components/DeviceQuickActions";
import { AgentActivityFeed } from "@/components/AgentActivityFeed";
import { DrugInteractionWarning } from "@/components/DrugInteractionWarning";
import { SocialWellnessCard } from "@/components/SocialWellnessCard";
import { UnifiedCheckin } from "@/components/UnifiedCheckin";
import { EnvironmentalAlert } from "@/components/EnvironmentalAlert";
import { CognitiveCheckIn } from "@/components/CognitiveCheckIn";
import { ActivityTracker } from "@/components/ActivityTracker";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { hideNativeSplash } from "@/lib/nativeSplash";

const traceJson = (value: unknown) => JSON.stringify(value, null, 2);

const Dashboard = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mainStreakCount, isLoading: streaksLoading } = useStreaks();
  const { achievements } = useAchievements();
  const [showCelebration, setShowCelebration] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);

  console.count("[DashboardTrace] Dashboard render");
  console.log(`[DashboardTrace] Dashboard state\n${traceJson({
    userId: user?.id,
    checkinOpen,
    showCelebration,
  })}`);

  useEffect(() => {
    hideNativeSplash();
  }, []);

  const navigateTo = (path: string) => {
    haptic("light");
    navigate(path);
  };

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: ritualData } = useQuery({
    queryKey: ["rituals", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const today = new Date().toISOString().split("T")[0];
      console.log(`[DashboardTrace] Ritual query start\n${traceJson({
        queryKey: ["rituals", user.id],
        today,
      })}`);

      const [behaviorLogs, bpLogs, sugarLogs] = await Promise.all([
        supabase.from("behavior_logs").select("*").eq("user_id", user.id).eq("log_date", today),
        supabase.from("bp_logs").select("*").eq("user_id", user.id)
          .gte("measured_at", `${today}T00:00:00`)
          .lt("measured_at", `${today}T23:59:59`),
        supabase.from("sugar_logs").select("*").eq("user_id", user.id)
          .gte("measured_at", `${today}T00:00:00`)
          .lt("measured_at", `${today}T23:59:59`),
      ]);

      const morningBehavior = behaviorLogs.data?.find((log) => log.ritual_type === "morning");
      const eveningBehavior = behaviorLogs.data?.find((log) => log.ritual_type === "evening");
      const morningBP = bpLogs.data?.find((log) => log.ritual_type === "morning");
      const eveningBP = bpLogs.data?.find((log) => log.ritual_type === "evening");
      const fastingSugar = sugarLogs.data?.find((log) => log.measurement_type === "fasting");
      const randomSugar = sugarLogs.data?.find((log) => log.measurement_type !== "fasting");

      const result = {
        morning: {
          completed: !!morningBehavior && !!morningBP,
          hasBP: !!morningBP,
          hasSugar: !!fastingSugar,
          hasSleep: !!morningBehavior?.sleep_quality,
          hasMeds: morningBehavior?.meds_taken === true,
        },
        evening: {
          completed: !!eveningBehavior && !!eveningBP,
          hasBP: !!eveningBP,
          hasSugar: !!randomSugar,
          hasSteps: !!eveningBehavior?.steps_count,
          hasMeds: eveningBehavior?.meds_taken === true,
        },
      };

      console.log(`[DashboardTrace] Ritual query response\n${traceJson({
        queryKey: ["rituals", user.id],
        errors: {
          behavior: behaviorLogs.error,
          bp: bpLogs.error,
          sugar: sugarLogs.error,
        },
        counts: {
          behavior: behaviorLogs.data?.length ?? 0,
          bp: bpLogs.data?.length ?? 0,
          sugar: sugarLogs.data?.length ?? 0,
        },
        result,
      })}`);

      return result;
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  // Fetch drug interactions count
  const { data: interactionCount } = useQuery({
    queryKey: ["drug-interactions-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data: meds } = await supabase
        .from("medications")
        .select("name")
        .eq("user_id", user.id)
        .eq("active", true);
      
      if (!meds || meds.length < 2) return 0;
      
      const medNames = meds.map(m => m.name.toLowerCase());
      const { data: interactions } = await supabase
        .from("drug_interactions")
        .select("*")
        .or(medNames.map(n => `drug_a.ilike.%${n}%,drug_b.ilike.%${n}%`).join(","));
      
      return interactions?.length || 0;
    },
    enabled: !!user?.id,
  });

  // Real-time subscription for ritual updates
  useEffect(() => {
    if (!user?.id) return;

    const behaviorChannel = supabase
      .channel('dashboard-behavior-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'behavior_logs', filter: `user_id=eq.${user.id}` }, () => {
        console.log(`[DashboardTrace] Realtime invalidation\n${traceJson({
          source: "behavior_logs",
          queryKey: ["rituals", user.id],
        })}`);
        queryClient.invalidateQueries({ queryKey: ["rituals", user.id] });
      })
      .subscribe();

    const bpChannel = supabase
      .channel('dashboard-bp-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bp_logs', filter: `user_id=eq.${user.id}` }, () => {
        console.log(`[DashboardTrace] Realtime invalidation\n${traceJson({
          source: "bp_logs",
          queryKey: ["rituals", user.id],
        })}`);
        queryClient.invalidateQueries({ queryKey: ["rituals", user.id] });
      })
      .subscribe();

    const sugarChannel = supabase
      .channel('dashboard-sugar-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sugar_logs', filter: `user_id=eq.${user.id}` }, () => {
        console.log(`[DashboardTrace] Realtime invalidation\n${traceJson({
          source: "sugar_logs",
          queryKey: ["rituals", user.id],
        })}`);
        queryClient.invalidateQueries({ queryKey: ["rituals", user.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(behaviorChannel);
      supabase.removeChannel(bpChannel);
      supabase.removeChannel(sugarChannel);
    };
  }, [user?.id, queryClient]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("dashboard.goodMorning") : hour < 17 ? t("dashboard.goodAfternoon") : t("dashboard.goodEvening");
  const isMorning = hour < 14;

  const quickAccessItems = [
    { title: t("dashboard.viewTrends"), icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10", path: "/app/insights" },
    { title: t("dashboard.familyDashboard"), icon: Users, color: "text-violet-500", bg: "bg-violet-500/10", path: "/app/family" },
    { title: t("dashboard.aiCopilot"), icon: MessageCircle, color: "text-primary", bg: "bg-primary/10", path: "/app/coach" },
    { title: t("dashboard.medications"), icon: Pill, color: "text-secondary", bg: "bg-secondary/10", path: "/app/medications" },
  ];

  return (
    <div data-dashboard-root className="min-h-screen pb-24 md:pb-6 bg-background">
      <Header />
      <InteractiveTutorial />
      <StreakCelebration show={showCelebration} streakCount={mainStreakCount} onClose={() => setShowCelebration(false)} />

      <main className="container mx-auto px-4 py-5 max-w-2xl">
        {/* Header Section */}
        <section className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold mb-1 text-foreground">
                {greeting}
                {profile?.full_name && <span className="text-primary">, {profile.full_name.split(" ")[0]}</span>}
              </h1>
              <p className="text-sm text-muted-foreground">{t("dashboard.tagline")}</p>
            </div>

            {!streaksLoading && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                <Flame className="w-5 h-5 text-orange-500" />
                <div className="text-right">
                  <p className="text-lg font-bold leading-none text-orange-600">{mainStreakCount}</p>
                  <p className="text-[10px] text-orange-500/70 uppercase tracking-wide">{t("common.days")}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Quick Check-in Button */}
        <section className="mb-4">
          <Sheet open={checkinOpen} onOpenChange={setCheckinOpen}>
            <SheetTrigger asChild>
              <Button 
                className="w-full h-14 text-base rounded-2xl gap-3"
                onClick={() => haptic("light")}
              >
                {isMorning ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                {isMorning ? t("checkin.startMorning") : t("checkin.startEvening")}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0">
              <UnifiedCheckin isOpen={checkinOpen} onClose={() => setCheckinOpen(false)} />
            </SheetContent>
          </Sheet>
        </section>

        {/* Alerts Row */}
        {interactionCount != null && interactionCount > 0 && (
          <section className="mb-4">
            <DrugInteractionWarning />
          </section>
        )}

        {/* Quick Log Actions */}
        <section className="mb-4">
          <QuickLogActions />
        </section>

        {/* Device Quick Actions - Scan BP/Sugar, Camera Heart Rate */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">{t("dashboard.smartCapture")}</h2>
          </div>
          <DeviceQuickActions />
        </section>

        {/* HeartScore Card */}
        <section data-dashboard-section="heart-score" className="mb-6">
          <HeartScoreCard />
        </section>

        {/* Today's Rituals */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-primary rounded-full" />
            {t("dashboard.todaysRituals")}
          </h2>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300">
              <RitualProgress
                title={t("ritual.morning")}
                subtitle={t("ritual.morningSubtitle")}
                icon={<Sun className="w-5 h-5 text-orange-500" />}
                completed={ritualData?.morning.completed || false}
                tasks={[
                  { label: t("ritual.bloodPressure"), done: ritualData?.morning.hasBP || false },
                  { label: t("ritual.fastingSugar"), done: ritualData?.morning.hasSugar || false },
                  { label: t("ritual.sleepQuality"), done: ritualData?.morning.hasSleep || false },
                  { label: t("ritual.medsTaken"), done: ritualData?.morning.hasMeds || false },
                ]}
                onStart={() => setCheckinOpen(true)}
              />
            </Card>

            <Card className="overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300">
              <RitualProgress
                title={t("ritual.evening")}
                subtitle={t("ritual.eveningSubtitle")}
                icon={<Moon className="w-5 h-5 text-indigo-500" />}
                completed={ritualData?.evening.completed || false}
                tasks={[
                  { label: t("ritual.bloodPressure"), done: ritualData?.evening.hasBP || false },
                  { label: t("ritual.randomSugar"), done: ritualData?.evening.hasSugar || false },
                  { label: t("ritual.stepsCount"), done: ritualData?.evening.hasSteps || false },
                  { label: t("ritual.medsTaken"), done: ritualData?.evening.hasMeds || false },
                ]}
                onStart={() => setCheckinOpen(true)}
              />
            </Card>
          </div>
        </section>

        {/* Social Wellness */}
        <section className="mb-6">
          <SocialWellnessCard />
        </section>

        {/* Environmental & Cognitive Health */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-secondary rounded-full" />
            {t("dashboard.healthMonitoring")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <EnvironmentalAlert />
            <CognitiveCheckIn />
          </div>
        </section>

        {/* Activity Tracker */}
        <section className="mb-6">
          <ActivityTracker />
        </section>

        {/* Quick Access */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-secondary rounded-full" />
            {t("dashboard.quickAccess")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {quickAccessItems.map((item, i) => (
              <button
                key={i}
                onClick={() => navigateTo(item.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border/50 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 active:scale-95"
              >
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <span className="text-xs font-medium text-center leading-tight">{item.title}</span>
              </button>
            ))}
          </div>
        </section>

        {/* More Features */}
        <section className="mb-6">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => navigateTo("/app/shop")}
              className="flex flex-col items-center p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-200/30 dark:border-amber-500/20 transition-all hover:scale-[1.02] active:scale-95"
            >
              <ShoppingBag className="w-5 h-5 text-amber-600 mb-1.5" />
              <span className="text-xs font-medium">{t("dashboard.shop")}</span>
            </button>
            <button
              onClick={() => navigateTo("/app/challenges")}
              className="flex flex-col items-center p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border border-emerald-200/30 dark:border-emerald-500/20 transition-all hover:scale-[1.02] active:scale-95"
            >
              <Trophy className="w-5 h-5 text-emerald-600 mb-1.5" />
              <span className="text-xs font-medium">{t("dashboard.challenges")}</span>
            </button>
            <button
              onClick={() => navigateTo("/app/subscription")}
              className="flex flex-col items-center p-3 rounded-xl bg-gradient-to-br from-rose-50 to-pink-50 dark:from-primary/10 dark:to-accent/10 border border-primary/20 transition-all hover:scale-[1.02] active:scale-95"
            >
              <Crown className="w-5 h-5 text-primary mb-1.5" />
              <span className="text-xs font-medium">{t("dashboard.premium")}</span>
            </button>
          </div>
        </section>

        {/* Achievements */}
        {achievements && achievements.length > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-amber-500 rounded-full" />
              {t("dashboard.achievements")}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {achievements.map((achievement) => (
                <div key={achievement.id} className="shrink-0 w-56">
                  <AchievementBadge type={achievement.badge_type} earnedAt={achievement.earned_at} size="small" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Agent Activity Feed - at bottom for non-intrusive monitoring */}
        <section className="mb-6">
          <AgentActivityFeed />
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
