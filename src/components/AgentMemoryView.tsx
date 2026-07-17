import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Brain, 
  Trash2, 
  RefreshCw,
  Star,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Lightbulb,
  AlertTriangle
} from "lucide-react";
import { useUserMemory } from "@/hooks/useUserMemory";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function AgentMemoryView() {
  const { t } = useLanguage();
  const { 
    memories, 
    userModel, 
    engagementStats, 
    isLoading, 
    forget,
    getMemoriesByType 
  } = useUserMemory();
  
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleForget = async (memoryId: string) => {
    try {
      setDeletingId(memoryId);
      await forget(memoryId);
      toast.success(t("agent.memoryCleared"));
    } catch (error) {
      toast.error(t("agent.memoryClearFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  const preferences = getMemoriesByType('preference');
  const patterns = getMemoriesByType('pattern');
  const facts = getMemoriesByType('fact');

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </Card>
    );
  }

  const totalMemories = memories?.length || 0;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t("agent.memory")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("agent.memoryDesc")}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs">
          {totalMemories} {t("agent.memories")}
        </Badge>
      </div>

      {/* Engagement Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-primary">{engagementStats.engagementRate.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">{t("agent.engagementRate")}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-green-600">{engagementStats.engaged}</p>
          <p className="text-xs text-muted-foreground">{t("agent.engaged")}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-red-500">{engagementStats.ignored}</p>
          <p className="text-xs text-muted-foreground">{t("agent.ignored")}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {engagementStats.avgResponseTime > 0 
              ? `${Math.round(engagementStats.avgResponseTime / 60)}m` 
              : '-'}
          </p>
          <p className="text-xs text-muted-foreground">{t("agent.avgResponse")}</p>
        </div>
      </div>

      <Separator className="my-4" />

      {/* User Model Insights */}
      {userModel && (
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            {t("agent.whatBeatKnows")}
          </h3>
          <div className="space-y-2 text-sm">
            {userModel.health_priorities?.primary && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10">
                <Star className="w-4 h-4 text-green-500" />
                <span>{t("agent.primaryFocus", { focus: userModel.health_priorities.primary })}</span>
              </div>
            )}
            {userModel.engagement_patterns?.preferredHours?.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>{t("agent.activeAround", { time: userModel.engagement_patterns.preferredHours.slice(0, 3).map((h: number) => `${h}:00`).join(', ') })}</span>
              </div>
            )}
            {userModel.engagement_patterns?.engagementRate > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-500/10">
                <TrendingUp className="w-4 h-4 text-violet-500" />
                <span>{t("agent.engagementRateText", { rate: userModel.engagement_patterns.engagementRate })}</span>
              </div>
            )}
            {userModel.pain_points?.nudgeFatigue?.detected && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{t("agent.nudgeFrequencyReduced")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <Separator className="my-4" />

      {/* Memory List */}
      <div className="space-y-4">
        {/* Preferences */}
        {preferences.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              {t("agent.learnedPreferences")} ({preferences.length})
            </h3>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {preferences.map((memory) => (
                  <div 
                    key={memory.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
                  >
                    <div className="flex-1">
                      <span className="font-medium">{memory.key.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground ml-2">
                        ({(memory.confidence * 100).toFixed(0)}% {t("agent.confident")})
                      </span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={deletingId === memory.id}
                        >
                          {deletingId === memory.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("agent.clearMemoryTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("agent.clearMemoryDesc", { memory: memory.key.replace(/_/g, ' ') })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleForget(memory.id)}>
                            {t("agent.clear")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Patterns */}
        {patterns.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              {t("agent.detectedPatterns")} ({patterns.length})
            </h3>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {patterns.map((memory) => (
                  <div 
                    key={memory.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
                  >
                    <div className="flex-1">
                      <span className="font-medium">{memory.key.replace(/_/g, ' ')}</span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={deletingId === memory.id}
                        >
                          {deletingId === memory.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("agent.clearPatternTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("agent.clearPatternDesc")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleForget(memory.id)}>
                            {t("agent.clear")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Facts */}
        {facts.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              {t("agent.knownFacts")} ({facts.length})
            </h3>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {facts.map((memory) => (
                  <div 
                    key={memory.id} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm"
                  >
                    <div className="flex-1">
                      <span className="font-medium">{memory.key.replace(/_/g, ' ')}</span>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          disabled={deletingId === memory.id}
                        >
                          {deletingId === memory.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("agent.clearFactTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("agent.clearFactDesc")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleForget(memory.id)}>
                            {t("agent.clear")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {totalMemories === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t("agent.stillLearning")}</p>
            <p className="text-sm mt-1">{t("agent.stillLearningDesc")}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
