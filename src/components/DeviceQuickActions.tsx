import { useState } from "react";
import { Camera, Smartphone, Heart, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import { SmartDeviceCapture } from "./SmartDeviceCapture";
import { CameraPPGMeasurement } from "./CameraPPGMeasurement";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { useLanguage } from "@/contexts/LanguageContext";

interface DeviceReading {
  systolic?: number;
  diastolic?: number;
  heart_rate?: number;
  glucose?: number;
  spo2?: number;
  measurement_type?: "fasting" | "random" | "post_meal";
}

export const DeviceQuickActions = () => {
  const { t } = useLanguage();
  const [deviceCaptureOpen, setDeviceCaptureOpen] = useState(false);
  const [deviceType, setDeviceType] = useState<"bp_monitor" | "glucose_meter" | "any">("any");
  const [ppgOpen, setPpgOpen] = useState(false);

  const handleOpenDeviceCapture = (type: "bp_monitor" | "glucose_meter" | "any") => {
    haptic("light");
    setDeviceType(type);
    setDeviceCaptureOpen(true);
  };

  const handleReadingCaptured = async (reading: DeviceReading) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("deviceCapture.loginFirst"));
        return;
      }

      // Save BP reading
      if (reading.systolic && reading.diastolic) {
        await supabase.from("bp_logs").insert({
          user_id: user.id,
          systolic: reading.systolic,
          diastolic: reading.diastolic,
          heart_rate: reading.heart_rate || null,
          measured_at: new Date().toISOString(),
          source_type: "ocr_capture",
          notes: "Captured via device camera"
        });
        toast.success(t("deviceCapture.bpSaved").replace("{value}", `${reading.systolic}/${reading.diastolic}`));
      }

      // Save glucose reading
      if (reading.glucose) {
        await supabase.from("sugar_logs").insert({
          user_id: user.id,
          glucose_mg_dl: reading.glucose,
          measurement_type: reading.measurement_type || "random",
          measured_at: new Date().toISOString(),
          source_type: "ocr_capture",
          notes: "Captured via device camera"
        });
        toast.success(t("deviceCapture.sugarSaved").replace("{value}", String(reading.glucose)));
      }

      setDeviceCaptureOpen(false);
    } catch (error) {
      console.error("Error saving reading:", error);
      toast.error(t("deviceCapture.saveFailed"));
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* Scan BP Monitor */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleOpenDeviceCapture("bp_monitor")}
        className="gap-2 text-xs rounded-full"
      >
        <Scan className="w-3.5 h-3.5" />
        {t("deviceCapture.scanBp")}
      </Button>

      {/* Scan Glucose Meter */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleOpenDeviceCapture("glucose_meter")}
        className="gap-2 text-xs rounded-full"
      >
        <Smartphone className="w-3.5 h-3.5" />
        {t("deviceCapture.scanSugar")}
      </Button>

      {/* Camera Heart Rate */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          haptic("light");
          setPpgOpen(true);
        }}
        className="gap-2 text-xs rounded-full"
      >
        <Heart className="w-3.5 h-3.5" />
        {t("deviceCapture.heartRate")}
      </Button>

      {/* Smart Device Capture Dialog */}
      <Dialog open={deviceCaptureOpen} onOpenChange={setDeviceCaptureOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              {t("deviceCapture.scanDeviceScreen")}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <SmartDeviceCapture
              deviceType={deviceType}
              onReadingCaptured={handleReadingCaptured}
              onClose={() => setDeviceCaptureOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera PPG Dialog */}
      <CameraPPGMeasurement
        isOpen={ppgOpen}
        onClose={() => setPpgOpen(false)}
        onComplete={(hr) => {
          toast.success(t("deviceCapture.hrRecorded").replace("{value}", String(hr)));
        }}
      />
    </div>
  );
};
