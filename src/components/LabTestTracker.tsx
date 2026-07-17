import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TestTube, Plus, Calendar, TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface LabResult {
  id: string;
  user_id: string;
  test_type: string;
  test_date: string;
  results: Record<string, number>;
  lab_name: string | null;
  notes: string | null;
  created_at: string;
}

const TEST_TYPES = [
  { value: "hba1c", label: "HbA1c", unit: "%", normalRange: { min: 4, max: 5.6 }, diabeticRange: { min: 0, max: 7 } },
  { value: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL", normalRange: { min: 70, max: 100 }, diabeticRange: { min: 70, max: 130 } },
  { value: "total_cholesterol", label: "Total Cholesterol", unit: "mg/dL", normalRange: { min: 0, max: 200 } },
  { value: "ldl", label: "LDL Cholesterol", unit: "mg/dL", normalRange: { min: 0, max: 100 } },
  { value: "hdl", label: "HDL Cholesterol", unit: "mg/dL", normalRange: { min: 40, max: 999 } },
  { value: "triglycerides", label: "Triglycerides", unit: "mg/dL", normalRange: { min: 0, max: 150 } },
  { value: "creatinine", label: "Creatinine", unit: "mg/dL", normalRange: { min: 0.7, max: 1.3 } },
  { value: "egfr", label: "eGFR", unit: "mL/min", normalRange: { min: 90, max: 999 } },
  { value: "uric_acid", label: "Uric Acid", unit: "mg/dL", normalRange: { min: 3.5, max: 7.2 } },
  { value: "tsh", label: "TSH", unit: "mIU/L", normalRange: { min: 0.4, max: 4.0 } },
];

export const LabTestTracker = () => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedTest, setSelectedTest] = useState("");
  const [testDate, setTestDate] = useState(new Date().toISOString().split("T")[0]);
  const [testValue, setTestValue] = useState("");
  const [labName, setLabName] = useState("");

  const { data: results, isLoading } = useQuery({
    queryKey: ["lab-results"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("lab_results")
        .select("*")
        .eq("user_id", user.id)
        .order("test_date", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as LabResult[];
    },
  });

  const { data: reminders } = useQuery({
    queryKey: ["lab-reminders"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("lab_reminders")
        .select("*")
        .eq("user_id", user.id)
        .order("next_due_date", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const addResult = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("lab_results")
        .insert({
          user_id: user.id,
          test_type: selectedTest,
          test_date: testDate,
          results: { [selectedTest]: parseFloat(testValue) },
          lab_name: labName || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Update or create reminder
      const testInfo = TEST_TYPES.find(t => t.value === selectedTest);
      const nextDue = new Date(testDate);
      nextDue.setMonth(nextDue.getMonth() + 3); // Default 3 months

      await supabase
        .from("lab_reminders")
        .upsert({
          user_id: user.id,
          test_type: selectedTest,
          frequency_months: 3,
          last_test_date: testDate,
          next_due_date: nextDue.toISOString().split("T")[0],
          reminder_sent: false,
        }, {
          onConflict: "user_id,test_type",
        });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lab-results"] });
      queryClient.invalidateQueries({ queryKey: ["lab-reminders"] });
      setShowAddDialog(false);
      setSelectedTest("");
      setTestValue("");
      setLabName("");
      toast.success(t("labs.resultAdded"));
    },
    onError: (error) => {
      console.error("Error adding lab result:", error);
      toast.error(t("labs.addFailed"));
    },
  });

  const getTestInfo = (testType: string) => {
    return TEST_TYPES.find(t => t.value === testType);
  };

  const getTrend = (testType: string): "up" | "down" | "stable" | null => {
    const testResults = results?.filter(r => r.test_type === testType).slice(0, 2);
    if (!testResults || testResults.length < 2) return null;

    const current = testResults[0].results[testType];
    const previous = testResults[1].results[testType];
    
    if (current > previous * 1.05) return "up";
    if (current < previous * 0.95) return "down";
    return "stable";
  };

  const isInRange = (testType: string, value: number): boolean => {
    const info = getTestInfo(testType);
    if (!info) return true;
    return value >= info.normalRange.min && value <= info.normalRange.max;
  };

  // Group results by test type and get latest
  const latestByType = TEST_TYPES.map(testType => {
    const latest = results?.find(r => r.test_type === testType.value);
    const reminder = reminders?.find(r => r.test_type === testType.value);
    return {
      ...testType,
      latestResult: latest,
      reminder,
    };
  }).filter(t => t.latestResult || t.reminder);

  // Upcoming tests
  const upcomingTests = reminders?.filter(r => {
    if (!r.next_due_date) return false;
    const daysUntil = differenceInDays(parseISO(r.next_due_date), new Date());
    return daysUntil <= 30 && daysUntil >= -7;
  }) || [];

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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <TestTube className="h-5 w-5 text-purple-500" />
            {t("labs.title")}
          </span>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                {t("labs.add")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("labs.addResult")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{t("labs.testType")}</Label>
                  <Select value={selectedTest} onValueChange={setSelectedTest}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("labs.selectTest")} />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map((test) => (
                        <SelectItem key={test.value} value={test.value}>
                          {test.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("labs.testDate")}</Label>
                  <Input
                    type="date"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    {t("labs.value")} {selectedTest && `(${getTestInfo(selectedTest)?.unit})`}
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={testValue}
                    onChange={(e) => setTestValue(e.target.value)}
                    placeholder={selectedTest ? `${t("labs.normal")}: ${getTestInfo(selectedTest)?.normalRange.min}-${getTestInfo(selectedTest)?.normalRange.max}` : ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("labs.labNameOptional")}</Label>
                  <Input
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                    placeholder={t("labs.labNamePlaceholder")}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => addResult.mutate()}
                  disabled={!selectedTest || !testValue}
                >
                  {t("labs.saveResult")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upcoming Tests Alert */}
        {upcomingTests.length > 0 && (
          <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
            <div className="flex items-center gap-2 text-orange-600 mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">{t("labs.testsDueSoon")}</span>
            </div>
            <div className="space-y-1">
              {upcomingTests.map((test) => {
                const info = getTestInfo(test.test_type);
                const daysUntil = differenceInDays(parseISO(test.next_due_date!), new Date());
                return (
                  <div key={test.id} className="flex justify-between text-sm">
                    <span>{info?.label || test.test_type}</span>
                    <span className={daysUntil < 0 ? "text-red-500" : "text-muted-foreground"}>
                      {daysUntil < 0 ? t("labs.daysOverdue", { count: Math.abs(daysUntil) }) : t("labs.inDays", { count: daysUntil })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Latest Results */}
        {latestByType.length > 0 ? (
          <div className="space-y-3">
            {latestByType.slice(0, 5).map((item) => {
              const value = item.latestResult?.results[item.value];
              const trend = getTrend(item.value);
              const inRange = value !== undefined ? isInRange(item.value, value) : true;

              return (
                <div
                  key={item.value}
                  className={`p-3 rounded-lg border ${
                    !inRange ? "border-red-500/30 bg-red-500/5" : "border-border/50 bg-background/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.latestResult
                          ? format(parseISO(item.latestResult.test_date), "MMM d, yyyy")
                          : t("labs.noResultsYet")}
                      </p>
                    </div>
                    <div className="text-right">
                      {value !== undefined ? (
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-bold ${!inRange ? "text-red-500" : ""}`}>
                            {value}
                          </span>
                          <span className="text-sm text-muted-foreground">{item.unit}</span>
                          {trend === "up" && <TrendingUp className="h-4 w-4 text-red-500" />}
                          {trend === "down" && <TrendingDown className="h-4 w-4 text-green-500" />}
                          {trend === "stable" && <Minus className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                  {!inRange && (
                    <p className="text-xs text-red-500 mt-1">
                      {t("labs.outsideNormalRange")} ({item.normalRange.min}-{item.normalRange.max})
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <TestTube className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{t("labs.noLabResults")}</p>
            <p className="text-sm text-muted-foreground">{t("labs.noLabResultsDesc")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
