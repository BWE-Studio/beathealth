import { Card } from "@/components/ui/card";
import { RefreshCw, Heart, Activity, Droplets, Calendar, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useHeartScore } from "@/hooks/useHeartScore";
import { useLanguage } from "@/contexts/LanguageContext";
import { haptic } from "@/lib/haptics";
import { ThemedIcon, ThemedEmoji } from "./ThemedIcon";

const traceJson = (value: unknown) => JSON.stringify(value, null, 2);

const HeartScoreCard = () => {
  const { todayScore, isLoading, calculateScore, isCalculating } = useHeartScore();
  const { t } = useLanguage();

  console.count("[HeartScoreTrace] HeartScoreCard render");

  const score = todayScore?.heart_score || 0;
  const bpScore = todayScore?.bp_score || 0;
  const sugarScore = todayScore?.sugar_score || 0;
  const consistencyScore = todayScore?.consistency_score || 0;
  const aiExplanation = todayScore?.ai_explanation;

  console.log(`[DashboardTrace] Displayed HeartScore values\n${traceJson({
    displayedHeartScore: score,
    displayedBpScore: bpScore,
    displayedSugarScore: sugarScore,
    displayedConsistencyScore: consistencyScore,
    isLoading,
    isCalculating,
    todayScore,
  })}`);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-secondary";
    if (score >= 70) return "text-score-good";
    if (score >= 60) return "text-score-moderate";
    if (score >= 50) return "text-score-poor";
    return "text-primary";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-secondary/10";
    if (score >= 70) return "bg-score-good/10";
    if (score >= 60) return "bg-score-moderate/10";
    if (score >= 50) return "bg-score-poor/10";
    return "bg-primary/10";
  };

  const getScoreGradient = (score: number) => {
    if (score >= 80) return "from-secondary to-secondary/70";
    if (score >= 70) return "from-score-good to-score-good/70";
    if (score >= 60) return "from-score-moderate to-score-moderate/70";
    return "from-primary to-primary/70";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return t("heartScore.excellent");
    if (score >= 70) return t("heartScore.good");
    if (score >= 60) return "Fair";
    if (score >= 50) return t("heartScore.needsWork");
    return "Critical";
  };

  if (isLoading) {
    return (
      <Card className="p-5 border-border/50 bg-card">
        <div className="flex items-center justify-center h-40">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/50 bg-card relative">
      {/* Subtle gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${getScoreBg(score)} opacity-50`} />
      
      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{t("heartScore.title")}</h2>
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="How is HeartScore calculated?"
                    onClick={() => haptic('light')}
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-3xl">
                  <SheetHeader className="text-left">
                    <SheetTitle>How is HeartScore calculated?</SheetTitle>
                    <SheetDescription>
                      Your HeartScore is calculated using your daily health habits and measurements.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-5 space-y-5 text-sm text-foreground">
                    <div>
                      <p className="font-medium">It considers factors such as:</p>
                      <ul className="mt-3 space-y-2 text-muted-foreground">
                        <li>• Blood Pressure</li>
                        <li>• Blood Sugar</li>
                        <li>• Daily Check-ins &amp; Consistency</li>
                        <li>• Sleep &amp; Lifestyle habits</li>
                        <li>• Social Well-being</li>
                        <li>• Environmental factors (when available)</li>
                        <li>• Cognitive assessments (when available)</li>
                      </ul>
                    </div>

                    <div className="space-y-2 text-muted-foreground">
                      <p>The score updates as new health data is recorded.</p>
                      <p>Missing health data may reduce score accuracy.</p>
                      <p>A higher score generally indicates healthier daily habits.</p>
                      <p>The score is meant to help track trends over time and should not replace medical advice.</p>
                    </div>

                    <div className="rounded-xl border border-primary/10 bg-primary/5 p-4">
                      <p className="font-medium">Improve your HeartScore by:</p>
                      <ul className="mt-3 space-y-2 text-muted-foreground">
                        <li>✓ Completing daily check-ins</li>
                        <li>✓ Logging BP and Sugar regularly</li>
                        <li>✓ Following healthy lifestyle habits</li>
                      </ul>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <p className="text-xs text-muted-foreground">Today's health snapshot</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-9 w-9"
            onClick={() => {
              haptic('light');
              calculateScore(undefined);
            }}
            disabled={isCalculating}
          >
            <RefreshCw className={`w-4 h-4 ${isCalculating ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Main Score */}
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-20 h-20 rounded-2xl ${getScoreBg(score)} flex items-center justify-center shadow-sm`}>
            <Heart className={`w-10 h-10 ${getScoreColor(score)}`} fill="currentColor" />
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className={`text-5xl font-bold ${getScoreColor(score)}`}>{score}</span>
              <span className="text-xl text-muted-foreground">/100</span>
            </div>
            <p className={`text-sm font-medium ${getScoreColor(score)}`}>{getScoreLabel(score)}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${getScoreGradient(score)} rounded-full transition-all duration-500`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Sub-Scores */}
        {todayScore && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/10">
              <ThemedIcon icon={Activity} size="sm" variant="primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">BP</p>
                <p className={`text-lg font-bold leading-none ${getScoreColor(bpScore)}`}>{bpScore}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/5 dark:bg-secondary/10 border border-secondary/10">
              <ThemedIcon icon={Droplets} size="sm" variant="secondary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Sugar</p>
                <p className={`text-lg font-bold leading-none ${getScoreColor(sugarScore)}`}>{sugarScore}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-accent/5 dark:bg-accent/10 border border-accent/10">
              <ThemedIcon icon={Calendar} size="sm" variant="accent" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Ritual</p>
                <p className={`text-lg font-bold leading-none ${getScoreColor(consistencyScore)}`}>{consistencyScore}</p>
              </div>
            </div>
          </div>
        )}

        {/* AI Insight or CTA */}
        {aiExplanation ? (
          <div className="bg-gradient-to-r from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10 border border-primary/10 rounded-xl p-3">
            <p className="text-xs leading-relaxed">
              <ThemedEmoji emoji="💡" size="sm" className="mr-1" />
              {aiExplanation}
            </p>
          </div>
        ) : !todayScore ? (
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Complete a ritual to calculate your HeartScore
            </p>
            <Button
              onClick={() => {
                haptic('light');
                calculateScore(undefined);
              }}
              disabled={isCalculating}
              size="sm"
              variant="outline"
              className="h-9"
            >
              {isCalculating ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                  Calculating...
                </>
              ) : (
                "Calculate Score"
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
};

export default HeartScoreCard;
