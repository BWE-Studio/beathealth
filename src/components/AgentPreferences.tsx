import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Bot, 
  Sparkles, 
  Target, 
  Bell, 
  AlertTriangle,
  Moon,
  Save,
  RotateCcw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface AgentPreferencesData {
  id: string;
  user_id: string;
  autonomy_level: 'minimal' | 'balanced' | 'full';
  auto_nudge_enabled: boolean;
  auto_goal_adjust_enabled: boolean;
  auto_celebrate_enabled: boolean;
  auto_escalate_enabled: boolean;
  max_nudges_per_day: number;
  max_goal_adjustments_per_week: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const autonomyLevels = [
  { value: 'minimal', labelKey: 'agent.minimal', descriptionKey: 'agent.minimalDesc' },
  { value: 'balanced', labelKey: 'agent.balanced', descriptionKey: 'agent.balancedDesc' },
  { value: 'full', labelKey: 'agent.full', descriptionKey: 'agent.fullDesc' }
];

export function AgentPreferences() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState<Partial<AgentPreferencesData>>({
    autonomy_level: 'balanced',
    auto_nudge_enabled: true,
    auto_goal_adjust_enabled: false,
    auto_celebrate_enabled: true,
    auto_escalate_enabled: true,
    max_nudges_per_day: 5,
    max_goal_adjustments_per_week: 2,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '07:00:00'
  });

  const { data: preferences, isLoading } = useQuery({
    queryKey: ["agent-preferences"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from("agent_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as AgentPreferencesData | null;
    }
  });

  useEffect(() => {
    if (preferences) {
      setFormData(preferences);
    }
  }, [preferences]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<AgentPreferencesData>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("agent_preferences")
        .upsert({
          user_id: user.id,
          ...data
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-preferences"] });
      setHasChanges(false);
      toast.success(t("agent.preferencesSaved"));
    },
    onError: (error) => {
      console.error("Save error:", error);
      toast.error(t("agent.preferencesFailed"));
    }
  });

  const updateField = <K extends keyof AgentPreferencesData>(key: K, value: AgentPreferencesData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleReset = () => {
    if (preferences) {
      setFormData(preferences);
      setHasChanges(false);
    }
  };

  const autonomyIndex = autonomyLevels.findIndex(l => l.value === formData.autonomy_level);

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

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t("agent.settings")}</h2>
            <p className="text-sm text-muted-foreground">{t("agent.settingsDesc")}</p>
          </div>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-1" />
              {t("common.reset")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-1" />
              {t("common.save")}
            </Button>
          </div>
        )}
      </div>

      {/* Autonomy Level */}
      <div className="mb-6">
        <Label className="text-sm font-medium mb-3 block">{t("agent.autonomyLevel")}</Label>
        <div className="space-y-3">
          <Slider
            value={[autonomyIndex >= 0 ? autonomyIndex : 1]}
            onValueChange={([index]) => updateField('autonomy_level', autonomyLevels[index].value as any)}
            max={2}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            {autonomyLevels.map((level) => (
              <span 
                key={level.value}
                className={formData.autonomy_level === level.value ? 'text-primary font-medium' : ''}
              >
                {t(level.labelKey)}
              </span>
            ))}
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <Badge variant="outline" className="mb-2">
              {t(autonomyLevels.find(l => l.value === formData.autonomy_level)?.labelKey || "agent.balanced")}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {t(autonomyLevels.find(l => l.value === formData.autonomy_level)?.descriptionKey || "agent.balancedDesc")}
            </p>
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Feature Toggles */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">{t("agent.automaticActions")}</Label>
        
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-blue-500" />
            <div>
              <p className="text-sm font-medium">{t("agent.autoNudges")}</p>
              <p className="text-xs text-muted-foreground">{t("agent.autoNudgesDesc")}</p>
            </div>
          </div>
          <Switch
            checked={formData.auto_nudge_enabled}
            onCheckedChange={(checked) => updateField('auto_nudge_enabled', checked)}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <div>
              <p className="text-sm font-medium">{t("agent.autoCelebrations")}</p>
              <p className="text-xs text-muted-foreground">{t("agent.autoCelebrationsDesc")}</p>
            </div>
          </div>
          <Switch
            checked={formData.auto_celebrate_enabled}
            onCheckedChange={(checked) => updateField('auto_celebrate_enabled', checked)}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            <Target className="w-4 h-4 text-violet-500" />
            <div>
              <p className="text-sm font-medium">{t("agent.autoGoalAdjustment")}</p>
              <p className="text-xs text-muted-foreground">{t("agent.autoGoalAdjustmentDesc")}</p>
            </div>
          </div>
          <Switch
            checked={formData.auto_goal_adjust_enabled}
            onCheckedChange={(checked) => updateField('auto_goal_adjust_enabled', checked)}
            disabled={formData.autonomy_level !== 'full'}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <div>
              <p className="text-sm font-medium">{t("agent.healthAlerts")}</p>
              <p className="text-xs text-muted-foreground">{t("agent.healthAlertsDesc")}</p>
            </div>
          </div>
          <Switch
            checked={formData.auto_escalate_enabled}
            onCheckedChange={(checked) => updateField('auto_escalate_enabled', checked)}
          />
        </div>
      </div>

      <Separator className="my-6" />

      {/* Limits */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">{t("agent.dailyLimits")}</Label>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("agent.maxNudgesPerDay")}</span>
            <Badge variant="secondary">{formData.max_nudges_per_day}</Badge>
          </div>
          <Slider
            value={[formData.max_nudges_per_day || 5]}
            onValueChange={([value]) => updateField('max_nudges_per_day', value)}
            min={1}
            max={10}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("agent.maxGoalAdjustmentsPerWeek")}</span>
            <Badge variant="secondary">{formData.max_goal_adjustments_per_week}</Badge>
          </div>
          <Slider
            value={[formData.max_goal_adjustments_per_week || 2]}
            onValueChange={([value]) => updateField('max_goal_adjustments_per_week', value)}
            min={0}
            max={5}
            step={1}
          />
        </div>
      </div>

      <Separator className="my-6" />

      {/* Quiet Hours */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-medium">{t("agent.quietHours")}</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("agent.quietHoursDesc")}
        </p>
        <div className="flex items-center gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">{t("agent.from")}</Label>
            <input
              type="time"
              value={formData.quiet_hours_start?.slice(0, 5) || '22:00'}
              onChange={(e) => updateField('quiet_hours_start', e.target.value + ':00')}
              className="block w-24 mt-1 px-2 py-1 text-sm rounded-md border border-input bg-background"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("agent.to")}</Label>
            <input
              type="time"
              value={formData.quiet_hours_end?.slice(0, 5) || '07:00'}
              onChange={(e) => updateField('quiet_hours_end', e.target.value + ':00')}
              className="block w-24 mt-1 px-2 py-1 text-sm rounded-md border border-input bg-background"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
