import { useState, useRef } from "react";
import { Camera, X, Loader2, Check, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface OCRReading {
  systolic?: number;
  diastolic?: number;
  heart_rate?: number;
  glucose?: number;
  measurement_type?: "fasting" | "random" | "post_meal";
}

interface ChatImageCaptureProps {
  onReadingDetected: (reading: OCRReading, summary: string) => void;
  onImageCaptured?: (base64: string) => void;
  disabled?: boolean;
}

export const ChatImageCapture = ({ 
  onReadingDetected, 
  onImageCaptured,
  disabled 
}: ChatImageCaptureProps) => {
  const { language } = useLanguage();
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<OCRReading | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleTakePhoto = () => {
    if (disabled || isProcessing) return;
    haptic("light");
    cameraInputRef.current?.click();
  };

  const handleChooseFromGallery = () => {
    if (disabled || isProcessing) return;
    haptic("light");
    galleryInputRef.current?.click();
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || isProcessing) return;

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error(language === "hi" ? "फ़ाइल बहुत बड़ी है" : "File too large (max 10MB)");
      e.currentTarget.value = "";
      return;
    }

    setIsProcessing(true);
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setPreview(base64);
      onImageCaptured?.(base64);
      await processWithOCR(base64);
    };
    reader.onerror = () => {
      setIsProcessing(false);
      toast.error(
        language === "hi"
          ? "छवि पढ़ने में त्रुटि हुई। कृपया दोबारा प्रयास करें।"
          : "Could not read the image. Please try another photo."
      );
      e.currentTarget.value = "";
    };
    reader.readAsDataURL(file);
  };

  const processWithOCR = async (base64: string) => {
    haptic("medium");
    toast.loading(language === "hi" ? "छवि प्रोसेस हो रही है..." : "Processing image...", {
      id: "chat-image-ocr",
    });

    try {
      const { data, error } = await supabase.functions.invoke("ocr-device-reading", {
        body: { imageBase64: base64 },
      });

      if (error) {
        throw new Error(error.message || "Image processing request failed");
      }

      if (data.success && data.readings) {
        setResult(data.readings);
        
        // Build summary for chat
        const parts: string[] = [];
        if (data.readings.systolic && data.readings.diastolic) {
          parts.push(`BP ${data.readings.systolic}/${data.readings.diastolic}`);
        }
        if (data.readings.heart_rate) {
          parts.push(`HR ${data.readings.heart_rate}`);
        }
        if (data.readings.glucose) {
          parts.push(`Sugar ${data.readings.glucose}`);
        }
        
        const summary = parts.length > 0 
          ? `📷 ${language === "hi" ? "पढ़ी गई" : "Detected"}: ${parts.join(", ")}`
          : language === "hi" ? "📷 कोई रीडिंग नहीं मिली" : "📷 No readings detected";
        
        onReadingDetected(data.readings, summary);
        haptic("success");
        
        toast.success(
          parts.length > 0
            ? (language === "hi" ? "छवि प्रोसेस हुई। रीडिंग पहचानी गई!" : "Image processed. Reading detected!")
            : (language === "hi" ? "छवि प्रोसेस हुई, लेकिन कोई रीडिंग नहीं मिली।" : "Image processed, but no reading was detected."),
          { id: "chat-image-ocr" }
        );
      } else {
        throw new Error(data.error || (language === "hi" ? "रीडिंग पहचान नहीं हुई। कृपया साफ़ फोटो लें।" : "Could not detect a reading. Please try a clearer photo."));
      }
    } catch (err) {
      console.error("OCR error:", err);
      haptic("error");
      const message = err instanceof Error ? err.message : "";
      toast.error(
        language === "hi"
          ? `छवि प्रोसेस नहीं हो सकी${message ? `: ${message}` : ""}`
          : `Image processing failed${message ? `: ${message}` : ""}`,
        { id: "chat-image-ocr" }
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const clearPreview = () => {
    if (isProcessing) return;
    setPreview(null);
    setResult(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  return (
    <div className="relative">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || isProcessing}
        onChange={handleImageSelect}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled || isProcessing}
        onChange={handleImageSelect}
      />

      {!preview ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled || isProcessing}
              className="rounded-full h-10 w-10"
              title={language === "hi" ? "डिवाइस स्कैन करें" : "Scan device reading"}
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={handleTakePhoto} disabled={disabled || isProcessing}>
              <Camera className="w-4 h-4 mr-2" />
              {language === "hi" ? "फोटो लें" : "Take Photo"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleChooseFromGallery} disabled={disabled || isProcessing}>
              <ImageIcon className="w-4 h-4 mr-2" />
              {language === "hi" ? "गैलरी से चुनें" : "Choose from Gallery"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="relative">
          <div className={cn(
            "relative w-10 h-10 rounded-full overflow-hidden border-2",
            isProcessing ? "border-primary/60" : "border-primary"
          )}>
            <img src={preview} alt="Captured" className="w-full h-full object-cover" />
            {isProcessing && (
              <div className="absolute inset-0 rounded-full bg-background/80 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
          </div>
          <button
            onClick={clearPreview}
            disabled={isProcessing}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center"
            title={language === "hi" ? "हटाएं" : "Remove image"}
          >
            <X className="w-3 h-3" />
          </button>
          {isProcessing && (
            <div className="absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap rounded-full bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-sm border">
              {language === "hi" ? "प्रोसेस हो रहा है..." : "Processing..."}
            </div>
          )}
          {result && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center">
              <Check className="w-3 h-3" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatImageCapture;
