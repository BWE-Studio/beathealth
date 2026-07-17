import { useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHeartScore } from "@/hooks/useHeartScore";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Activity, Droplet, TrendingUp, Download, Loader2, Sparkles, Brain, Target, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { HealthGoalsTracker } from "@/components/HealthGoalsTracker";
import { RiskForecast } from "@/components/RiskForecast";
import { WellnessActivities } from "@/components/WellnessActivities";
import { DeepHealthAnalysis } from "@/components/DeepHealthAnalysis";
import { Logo } from "@/components/Logo";
import { useLanguage } from "@/contexts/LanguageContext";
import { FeatureGate } from "@/components/FeatureGate";

const Insights = () => {
  const { history, todayScore } = useHeartScore();
  const { language, t } = useLanguage();
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Fetch AI-generated insights
  const { data: aiInsights, isLoading: insightsLoading } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-insights');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch BP logs for last 30 days
  const { data: bpLogs } = useQuery({
    queryKey: ["bp", "history"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("bp_logs")
        .select("*")
        .eq("user_id", user?.id)
        .gte("measured_at", thirtyDaysAgo.toISOString())
        .order("measured_at", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Fetch sugar logs for last 30 days
  const { data: sugarLogs } = useQuery({
    queryKey: ["sugar", "history"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("sugar_logs")
        .select("*")
        .eq("user_id", user?.id)
        .gte("measured_at", thirtyDaysAgo.toISOString())
        .order("measured_at", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Transform HeartScore data for chart
  const heartScoreData = history?.map((score) => ({
    date: new Date(score.score_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: score.heart_score,
    bp: score.bp_score,
    sugar: score.sugar_score,
    consistency: score.consistency_score,
  })) || [];

  // Transform BP data for chart
  const bpData = bpLogs?.reduce((acc: any[], log) => {
    const date = new Date(log.measured_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const existing = acc.find((item) => item.date === date);
    if (existing) {
      existing.systolic = Math.round((existing.systolic + log.systolic) / 2);
      existing.diastolic = Math.round((existing.diastolic + log.diastolic) / 2);
    } else {
      acc.push({ date, systolic: log.systolic, diastolic: log.diastolic });
    }
    return acc;
  }, []) || [];

  // Transform sugar data for chart
  const sugarData = sugarLogs?.reduce((acc: any[], log) => {
    const date = new Date(log.measured_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const existing = acc.find((item) => item.date === date);
    if (existing) {
      existing.glucose = Math.round((existing.glucose + log.glucose_mg_dl) / 2);
    } else {
      acc.push({ date, glucose: log.glucose_mg_dl, type: log.measurement_type });
    }
    return acc;
  }, []) || [];

  // Generate PDF Report
  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf-report');
      
      if (error) {
        if (error.message?.includes('429')) {
          toast.error(language === 'hi' ? 'बहुत सारी PDF रिपोर्ट। कृपया एक घंटे बाद पुनः प्रयास करें।' : 'Too many PDF reports. Please try again in an hour.');
        } else {
          throw error;
        }
        return;
      }

      if (data?.pdf) {
        const byteCharacters = atob(data.pdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `beat-health-report-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success(language === 'hi' ? 'रिपोर्ट डाउनलोड हो गई!' : 'Report downloaded!');
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error(language === 'hi' ? 'रिपोर्ट बनाने में त्रुटि' : 'Failed to generate report');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-secondary";
    if (score >= 70) return "text-score-good";
    if (score >= 60) return "text-score-moderate";
    return "text-primary";
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6">
      <Header />

      <main className="container mx-auto px-4 py-5 max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">
              {language === 'hi' ? 'स्वास्थ्य इनसाइट्स' : 'Health Insights'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {language === 'hi' ? 'अपने स्वास्थ्य रुझान देखें' : 'Track your health trends and patterns'}
            </p>
          </div>
          <FeatureGate feature="pdf_reports">
            <Button 
              onClick={handleGeneratePdf} 
              disabled={generatingPdf}
              className="gap-2 shrink-0"
            >
              {generatingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {language === 'hi' ? 'PDF रिपोर्ट' : 'PDF Report'}
            </Button>
          </FeatureGate>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-0.5">{t("insights.avgBP")}</p>
            <p className="text-xl font-bold">{aiInsights?.summary?.avgSystolic || '--'}/{aiInsights?.summary?.avgDiastolic || '--'}</p>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                <Droplet className="w-4 h-4 text-secondary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-0.5">{t("insights.avgSugar")}</p>
            <p className="text-xl font-bold">{aiInsights?.summary?.avgSugar || '--'} mg/dL</p>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center">
                <Logo size="sm" showText={false} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-0.5">{t("insights.heartScore")}</p>
            <p className={`text-xl font-bold ${getScoreColor(todayScore?.heart_score || 0)}`}>
              {todayScore?.heart_score || '--'}/100
            </p>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-0.5">{t("insights.avgSteps")}</p>
            <p className="text-xl font-bold">{aiInsights?.summary?.avgSteps || '--'}</p>
          </Card>
        </div>

        {/* AI Insights Card */}
        <FeatureGate feature="advanced_insights">
          {aiInsights?.insights && (
            <Card className="p-5 mb-6 bg-gradient-to-br from-primary/5 via-card to-secondary/5 border-primary/20">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1 flex items-center gap-2">
                    {t("insights.aiInsights")}
                    <Sparkles className="w-4 h-4 text-primary" />
                  </h3>
                  <p className="text-sm text-muted-foreground">{t("insights.personalized")}</p>
                </div>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiInsights.insights}</p>
              </div>
            </Card>
          )}
        </FeatureGate>

        {/* Charts */}
        <Tabs defaultValue="heartscore" className="space-y-4 mb-6">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="heartscore" className="gap-2">
              <Logo size="sm" showText={false} className="w-4 h-4" />
              <span className="hidden sm:inline">{t("insights.heartScore")}</span>
            </TabsTrigger>
            <TabsTrigger value="bp" className="gap-2">
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">BP</span>
            </TabsTrigger>
            <TabsTrigger value="sugar" className="gap-2">
              <Droplet className="w-4 h-4" />
              <span className="hidden sm:inline">{t("heartScore.sugar")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="heartscore">
            <Card className="p-5 border-border/50">
              <h3 className="text-lg font-semibold mb-4">{t("insights.heartScoreTrend")}</h3>
              {heartScoreData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={heartScoreData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis domain={[0, 100]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      fill="url(#colorScore)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t("insights.emptyHeartScore")}</p>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="bp">
            <Card className="p-5 border-border/50">
              <h3 className="text-lg font-semibold mb-4">{t("insights.bpTrend")}</h3>
              {bpData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={bpData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis domain={[60, 180]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                      }}
                    />
                    <Line type="monotone" dataKey="systolic" stroke="hsl(var(--primary))" strokeWidth={2} name="Systolic" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="diastolic" stroke="hsl(var(--secondary))" strokeWidth={2} name="Diastolic" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t("insights.emptyBp")}</p>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="sugar">
            <Card className="p-5 border-border/50">
              <h3 className="text-lg font-semibold mb-4">{t("insights.sugarTrend")}</h3>
              {sugarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={sugarData}>
                    <defs>
                      <linearGradient id="colorSugar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis domain={[60, 250]} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                      }}
                    />
                    <Area type="monotone" dataKey="glucose" stroke="hsl(var(--secondary))" strokeWidth={3} fill="url(#colorSugar)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Droplet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t("insights.emptySugar")}</p>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Risk Forecast */}
        <section className="mb-6">
          <FeatureGate feature="advanced_insights">
            <RiskForecast />
          </FeatureGate>
        </section>

        {/* Deep Health Analysis */}
        <section className="mb-6">
          <FeatureGate feature="advanced_insights">
            <DeepHealthAnalysis />
          </FeatureGate>
        </section>

        {/* Wellness Activities */}
        <section className="mb-6">
          <WellnessActivities />
        </section>

        {/* Health Goals */}
        <section>
          <HealthGoalsTracker />
        </section>
      </main>
    </div>
  );
};

export default Insights;
