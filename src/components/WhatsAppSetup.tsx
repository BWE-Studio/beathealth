import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MessageCircle, CheckCircle2, AlertCircle, Phone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const WhatsAppSetup = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  // Fetch profile for phone number
  const { data: profile } = useQuery({
    queryKey: ["profile-phone", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch notification preferences
  const { data: notifPrefs } = useQuery({
    queryKey: ["notification-prefs", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("notification_preferences")
        .select("whatsapp_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
    if (notifPrefs) setWhatsappEnabled(notifPrefs.whatsapp_enabled ?? true);
  }, [profile, notifPrefs]);

  const savePhone = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      
      // Validate phone format
      const cleanPhone = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
      if (!cleanPhone.match(/^\+?\d{10,15}$/)) {
        throw new Error(language === "hi" 
          ? "कृपया सही फोन नंबर डालें" 
          : "Please enter a valid phone number");
      }
      
      await Promise.all([
        supabase
          .from("profiles")
          .update({ phone: cleanPhone })
          .eq("id", user.id),
        supabase
          .from("notification_preferences")
          .upsert({
            user_id: user.id,
            whatsapp_enabled: whatsappEnabled,
          }),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-phone"] });
      queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      toast.success(
        language === "hi" 
          ? "WhatsApp सेटिंग्स सेव हो गई!" 
          : "WhatsApp settings saved!"
      );
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const hasPhone = !!profile?.phone;
  const isSetup = hasPhone && whatsappEnabled;

  return (
    <Card className="overflow-hidden">
      <div className={`p-4 border-b ${isSetup ? "bg-green-500/10" : "bg-muted/50"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isSetup ? "bg-green-500/20" : "bg-muted"
            }`}>
              <MessageCircle className={`w-5 h-5 ${isSetup ? "text-green-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                WhatsApp {language === "hi" ? "सूचनाएं" : "Notifications"}
                {isSetup ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {language === "hi" ? "सक्रिय" : "Active"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {language === "hi" ? "सेटअप करें" : "Setup needed"}
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                {language === "hi" 
                  ? "दैनिक अनुस्मारक और स्वास्थ्य अलर्ट" 
                  : "Daily reminders & health alerts"}
              </p>
            </div>
          </div>
          <Switch
            checked={whatsappEnabled}
            onCheckedChange={setWhatsappEnabled}
          />
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <Label htmlFor="whatsapp-phone" className="text-sm">
            {language === "hi" ? "WhatsApp नंबर" : "WhatsApp Number"}
          </Label>
          <div className="flex gap-2 mt-1.5">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="whatsapp-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="pl-10"
              />
            </div>
            <Button
              onClick={() => savePhone.mutate()}
              disabled={savePhone.isPending || !phone}
            >
              {savePhone.isPending 
                ? (language === "hi" ? "सेव हो रहा..." : "Saving...") 
                : (language === "hi" ? "सेव करें" : "Save")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {language === "hi" 
              ? "देश कोड के साथ पूरा नंबर डालें (जैसे +91)" 
              : "Enter full number with country code (e.g., +91)"}
          </p>
        </div>

        {isSetup && (
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">
              {language === "hi" ? "आप प्राप्त करेंगे:" : "You'll receive:"}
            </p>
            <ul className="text-muted-foreground text-xs space-y-1">
              <li>• {language === "hi" ? "सुबह और शाम की चेक-इन याद दिलाना" : "Morning & evening check-in reminders"}</li>
              <li>• {language === "hi" ? "दवाई अनुस्मारक" : "Medication reminders"}</li>
              <li>• {language === "hi" ? "महत्वपूर्ण स्वास्थ्य अलर्ट" : "Important health alerts"}</li>
              <li>• {language === "hi" ? "साप्ताहिक स्वास्थ्य सारांश" : "Weekly health summaries"}</li>
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
};
