import { useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, Plus, Check, X, Trash2 } from "lucide-react";
import { useMedications } from "@/hooks/useMedications";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";

const Medications = () => {
  const { medications, logs, adherenceRate, isLoading, addMedication, logMedication, deleteMedication } = useMedications();
  const { t } = useLanguage();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMed, setNewMed] = useState({
    name: "",
    dosage: "",
    frequency: "morning",
    notes: "",
  });

  const handleAddMedication = () => {
    if (!newMed.name) return;
    addMedication({
      name: newMed.name,
      dosage: newMed.dosage,
      frequency: newMed.frequency,
      custom_times: null,
      notes: newMed.notes,
      active: true,
    });
    setNewMed({ name: "", dosage: "", frequency: "morning", notes: "" });
    setShowAddDialog(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t("medications.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6 animate-fade-in">
      <Header />

      <main className="container mx-auto px-4 py-4 md:py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">{t("medications.title")}</h1>
            <p className="text-muted-foreground">{t("medications.subtitle")}</p>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t("medications.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("medications.addNew")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>{t("medications.name")}</Label>
                  <Input
                    value={newMed.name}
                    onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
                    placeholder={t("medications.namePlaceholder")}
                  />
                </div>
                <div>
                  <Label>{t("medications.dosage")}</Label>
                  <Input
                    value={newMed.dosage}
                    onChange={(e) => setNewMed({ ...newMed, dosage: e.target.value })}
                    placeholder={t("medications.dosagePlaceholder")}
                  />
                </div>
                <div>
                  <Label>{t("medications.frequency")}</Label>
                  <Select value={newMed.frequency} onValueChange={(value) => setNewMed({ ...newMed, frequency: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">{t("medications.morningOnly")}</SelectItem>
                      <SelectItem value="evening">{t("medications.eveningOnly")}</SelectItem>
                      <SelectItem value="both">{t("medications.morningEvening")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("medications.notes")}</Label>
                  <Input
                    value={newMed.notes}
                    onChange={(e) => setNewMed({ ...newMed, notes: e.target.value })}
                    placeholder={t("medications.notesPlaceholder")}
                  />
                </div>
                <Button onClick={handleAddMedication} className="w-full" disabled={!newMed.name}>
                  {t("medications.add")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Adherence Card */}
        <Card className="p-6 mb-6 shadow-elevated">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t("medications.adherenceRate")}</h2>
            <span className="text-3xl font-bold text-primary">{adherenceRate}%</span>
          </div>
          <Progress value={adherenceRate} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {t("medications.adherenceProgress")
              .replace("{taken}", String(logs.filter(log => log.taken_at).length))
              .replace("{total}", String(logs.length))}
          </p>
        </Card>

        {/* Medications List */}
        <div className="space-y-4">
          {medications.length === 0 ? (
            <Card className="p-8 text-center">
              <Pill className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">{t("medications.noMedications")}</p>
              <Button onClick={() => setShowAddDialog(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                {t("medications.addFirst")}
              </Button>
            </Card>
          ) : (
            medications.map((med) => {
              const todayLogs = logs.filter(
                (log) =>
                  log.medication_id === med.id &&
                  new Date(log.scheduled_at).toDateString() === new Date().toDateString()
              );
              const taken = todayLogs.some((log) => log.taken_at);

              return (
                <Card key={med.id} className="p-4 shadow-card">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Pill className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">{med.name}</h3>
                      </div>
                      {med.dosage && (
                        <p className="text-sm text-muted-foreground mb-1">{t("medications.dosagePrefix")} {med.dosage}</p>
                      )}
                      <p className="text-sm text-muted-foreground mb-1">
                        {t("medications.frequencyPrefix")}{" "}
                        {med.frequency === "morning"
                          ? t("medications.morning")
                          : med.frequency === "evening"
                          ? t("medications.evening")
                          : t("medications.morningEvening")}
                      </p>
                      {med.notes && <p className="text-sm text-muted-foreground italic">{med.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      {!taken ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => logMedication({ medicationId: med.id, taken: true })}
                            className="gap-1"
                          >
                            <Check className="h-4 w-4" />
                            {t("medications.taken")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => logMedication({ medicationId: med.id, taken: false })}
                            className="gap-1"
                          >
                            <X className="h-4 w-4" />
                            {t("medications.skip")}
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-green-600">
                          <Check className="h-5 w-5" />
                          <span className="text-sm font-medium">{t("medications.takenToday")}</span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMedication(med.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};

export default Medications;
