import { useState, useRef, useCallback } from "react";
import { Camera, Scan, Check, RotateCcw, Loader2, AlertCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface DeviceReading {
  systolic?: number;
  diastolic?: number;
  heart_rate?: number;
  glucose?: number;
  spo2?: number;
  temperature?: number;
  weight?: number;
  measurement_type?: "fasting" | "random" | "post_meal";
}

interface SmartDeviceCaptureProps {
  deviceType: "bp_monitor" | "glucose_meter" | "pulse_oximeter" | "any";
  onReadingCaptured: (reading: DeviceReading) => void;
  onClose?: () => void;
  compact?: boolean;
}

export const SmartDeviceCapture = ({
  deviceType,
  onReadingCaptured,
  onClose,
  compact = false,
}: SmartDeviceCaptureProps) => {
  const { language } = useLanguage();
  const [stage, setStage] = useState<"idle" | "capturing" | "processing" | "result">("idle");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<DeviceReading | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [suggestions, setSuggestions] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deviceLabels = {
    bp_monitor: language === "hi" ? "बीपी मॉनिटर" : "BP Monitor",
    glucose_meter: language === "hi" ? "शुगर मीटर" : "Glucose Meter",
    pulse_oximeter: language === "hi" ? "ऑक्सीमीटर" : "Pulse Oximeter",
    any: language === "hi" ? "कोई भी डिवाइस" : "Any Device",
  };

  const getUnableToReadMessage = (details?: string) => {
    const label = deviceLabels[deviceType];
    if (language === "hi") {
      return details || `${label} पढ़ा नहीं जा सका। कृपया साफ़ फोटो लें और दोबारा प्रयास करें।`;
    }
    return details || `Unable to read the ${label}. Please take a clearer photo and try again.`;
  };

  const handleCapture = useCallback(() => {
    if (stage === "capturing" || stage === "processing") return;
    haptic("light");
    fileInputRef.current?.click();
  }, [stage]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (stage === "capturing" || stage === "processing") return;

    const file = e.target.files?.[0];
    if (!file) return;

    console.log("[OCR][SmartDeviceCapture] Image selected", {
      deviceType,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      lastModified: file.lastModified,
    });

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      console.log("[OCR][SmartDeviceCapture] Image rejected: file too large", {
        fileSize: file.size,
        maxSize: 10 * 1024 * 1024,
      });
      const message = language === "hi" ? "फ़ाइल बहुत बड़ी है (max 10MB)" : "File too large (max 10MB)";
      setError(message);
      toast.error(message);
      e.currentTarget.value = "";
      return;
    }

    setStage("capturing");
    setError(null);
    haptic("medium");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      console.log("[OCR][SmartDeviceCapture] FileReader loaded image", {
        deviceType,
        base64Length: base64?.length,
        base64Prefix: base64?.slice(0, 80),
      });
      setImagePreview(base64);
      await processImage(base64);
    };
    reader.onerror = () => {
      console.error("[OCR][SmartDeviceCapture] FileReader failed", reader.error);
      const message = language === "hi"
        ? "फोटो पढ़ी नहीं जा सकी। कृपया दूसरी फोटो लेकर दोबारा प्रयास करें।"
        : "Could not read the photo. Please take another photo and try again.";
      setError(message);
      setStage("idle");
      haptic("error");
      toast.error(message);
      e.currentTarget.value = "";
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64: string) => {
    setStage("processing");
    setError(null);

    try {
      const requestBody = {
        imageBase64: base64,
        deviceHint: deviceType !== "any" ? deviceType : undefined,
      };

      console.log("[OCR][SmartDeviceCapture] Invoking ocr-device-reading", {
        deviceType,
        deviceHint: requestBody.deviceHint,
        imageBase64Length: base64.length,
        imageBase64Prefix: base64.slice(0, 80),
      });

      const { data, error: fnError } = await supabase.functions.invoke("ocr-device-reading", {
        body: requestBody,
      });

      console.log("[OCR][SmartDeviceCapture] Edge function response", {
        data,
        fnError,
      });

      if (fnError) {
        console.error("[OCR][SmartDeviceCapture] Edge function returned error", fnError);
        throw fnError;
      }

      if (!data.success) {
        console.log("[OCR][SmartDeviceCapture] OCR returned success=false", data);
        const message = getUnableToReadMessage(data.error);
        setError(message);
        haptic("error");
        toast.error(message);
        setStage("idle");
        return;
      }

      console.log("[OCR][SmartDeviceCapture] Parsed OCR values", {
        readings: data.readings,
        confidence: data.confidence,
        suggestions: data.suggestions,
        raw_text: data.raw_text,
      });

      setResult(data.readings);
      setConfidence(data.confidence);
      setSuggestions(data.suggestions || "");
      setStage("result");
      haptic("success");

      toast.success(
        data.confidence >= 0.85
          ? (language === "hi" 
              ? `✓ ${data.confidence >= 0.95 ? "एकदम सही" : "अच्छी"} पहचान!` 
              : `✓ ${data.confidence >= 0.95 ? "Perfect" : "Good"} reading detected!`)
          : (language === "hi"
              ? "रीडिंग पहचानी गई। कृपया उपयोग करने से पहले जांच लें।"
              : "Reading detected. Please review before using.")
      );
    } catch (err) {
      console.error("[OCR][SmartDeviceCapture] OCR exception", err);
      const message = language === "hi"
        ? "पढ़ने में त्रुटि। कृपया पुन: प्रयास करें।"
        : "Failed to read. Please try again.";
      setError(message);
      setStage("idle");
      haptic("error");
      toast.error(message);
    }
  };

  const handleConfirm = () => {
    if (result) {
      haptic("success");
      onReadingCaptured(result);
      toast.success(language === "hi" ? "रीडिंग सेव हो गई!" : "Reading saved!");
      resetCapture();
      onClose?.();
    }
  };

  const resetCapture = () => {
    setStage("idle");
    setImagePreview(null);
    setResult(null);
    setConfidence(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatReading = (reading: DeviceReading) => {
    const parts: string[] = [];
    if (reading.systolic && reading.diastolic) {
      parts.push(`BP: ${reading.systolic}/${reading.diastolic}`);
    }
    if (reading.heart_rate) {
      parts.push(`HR: ${reading.heart_rate} bpm`);
    }
    if (reading.glucose) {
      parts.push(`Sugar: ${reading.glucose} mg/dL`);
    }
    if (reading.spo2) {
      parts.push(`SpO2: ${reading.spo2}%`);
    }
    return parts.join(" • ") || "No readings detected";
  };

  if (compact) {
    return (
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={stage === "capturing" || stage === "processing"}
          onChange={handleImageSelect}
        />
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleCapture}
          disabled={stage === "capturing" || stage === "processing"}
          className="gap-2"
        >
          {stage === "capturing" || stage === "processing" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          {language === "hi" ? "फोटो से पढ़ें" : "Scan Device"}
        </Button>

        {stage === "result" && result && (
          <Dialog open onOpenChange={() => resetCapture()}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  {language === "hi" ? "पहचानी गई रीडिंग" : "Detected Reading"}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {imagePreview && (
                  <img 
                    src={imagePreview} 
                    alt="Device" 
                    className="w-full h-32 object-cover rounded-lg"
                  />
                )}
                
                <div className="p-4 bg-primary/10 rounded-xl">
                  <p className="text-xl font-bold text-center">{formatReading(result)}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {language === "hi" ? "विश्वास स्तर" : "Confidence"}
                    </span>
                    <span className={cn(
                      "font-medium",
                      confidence >= 0.85 ? "text-green-600" : confidence >= 0.6 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {Math.round(confidence * 100)}%
                    </span>
                  </div>
                  <Progress value={confidence * 100} className="h-2" />
                </div>

                {suggestions && confidence < 0.85 && (
                  <p className="text-xs text-muted-foreground italic">{suggestions}</p>
                )}
                
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={resetCapture}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {language === "hi" ? "दोबारा" : "Retry"}
                  </Button>
                  <Button className="flex-1" onClick={handleConfirm}>
                    <Check className="w-4 h-4 mr-2" />
                    {language === "hi" ? "इस्तेमाल करें" : "Use This"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={stage === "capturing" || stage === "processing"}
        onChange={handleImageSelect}
      />

      {stage === "idle" && (
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Camera className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">
              {language === "hi" ? `${deviceLabels[deviceType]} स्कैन करें` : `Scan ${deviceLabels[deviceType]}`}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {language === "hi" 
                ? "डिवाइस स्क्रीन की फोटो लें, AI पढ़ेगा" 
                : "Take a photo of the device screen"}
            </p>
          </div>
          <Button
            onClick={handleCapture}
            className="w-full"
            size="lg"
            disabled={stage === "capturing" || stage === "processing"}
          >
            <Camera className="w-5 h-5 mr-2" />
            {language === "hi" ? "कैमरा खोलें" : "Open Camera"}
          </Button>
        </div>
      )}

      {stage === "capturing" && (
        <div className="text-center py-8">
          <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
          <p className="mt-4 text-muted-foreground">
            {language === "hi" ? "फोटो ले रहे हैं..." : "Capturing..."}
          </p>
        </div>
      )}

      {stage === "processing" && (
        <div className="text-center space-y-4 py-4">
          {imagePreview && (
            <img 
              src={imagePreview} 
              alt="Captured device" 
              className="w-full h-40 object-cover rounded-xl"
            />
          )}
          <div className="flex items-center justify-center gap-3">
            <Scan className="w-6 h-6 text-primary animate-pulse" />
            <span className="font-medium">
              {language === "hi" ? "AI पढ़ रहा है..." : "AI Reading..."}
            </span>
          </div>
          <Progress value={66} className="h-2 animate-pulse" />
        </div>
      )}

      {stage === "result" && result && (
        <div className="space-y-4">
          {imagePreview && (
            <img 
              src={imagePreview} 
              alt="Captured device" 
              className="w-full h-32 object-cover rounded-xl"
            />
          )}
          
          <div className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl border border-primary/20">
            <p className="text-2xl font-bold text-center">{formatReading(result)}</p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {language === "hi" ? "विश्वास स्तर" : "Confidence Level"}
              </span>
              <span className={cn(
                "font-semibold",
                confidence >= 0.85 ? "text-green-600" : confidence >= 0.6 ? "text-yellow-600" : "text-red-600"
              )}>
                {Math.round(confidence * 100)}%
              </span>
            </div>
            <Progress 
              value={confidence * 100} 
              className={cn(
                "h-2",
                confidence >= 0.85 ? "[&>div]:bg-green-500" : confidence >= 0.6 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"
              )} 
            />
          </div>

          {suggestions && confidence < 0.85 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-yellow-700 dark:text-yellow-400">{suggestions}</p>
            </div>
          )}
          
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={resetCapture}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {language === "hi" ? "दोबारा लें" : "Retake"}
            </Button>
            <Button className="flex-1 gradient-primary text-white" onClick={handleConfirm}>
              <Check className="w-4 h-4 mr-2" />
              {language === "hi" ? "इस्तेमाल करें" : "Use Reading"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </Card>
  );
};

export default SmartDeviceCapture;
