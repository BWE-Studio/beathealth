import { useEffect } from "react";
import { useMedications } from "./useMedications";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMedicationReminders = () => {
  const { medications } = useMedications();

  // Get ritual times from profile
  const { data: profile } = useQuery({
    queryKey: ["profile-ritual-times"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("morning_ritual_time, evening_ritual_time")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    if (!medications || medications.length === 0 || !profile) return;

    const checkReminders = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      medications.forEach((med) => {
        let shouldNotify = false;

        if (med.frequency === "morning" && profile.morning_ritual_time) {
          shouldNotify = currentTime === profile.morning_ritual_time.slice(0, 5);
        } else if (med.frequency === "evening" && profile.evening_ritual_time) {
          shouldNotify = currentTime === profile.evening_ritual_time.slice(0, 5);
        } else if (med.frequency === "both") {
          shouldNotify =
            (profile.morning_ritual_time && currentTime === profile.morning_ritual_time.slice(0, 5)) ||
            (profile.evening_ritual_time && currentTime === profile.evening_ritual_time.slice(0, 5));
        }

        if (shouldNotify && Notification.permission === "granted") {
          new Notification("Medication Reminder", {
            body: `Time to take ${med.name}${med.dosage ? ` (${med.dosage})` : ""}`,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: `med-${med.id}`,
            requireInteraction: true,
          });
        }
      });
    };

    // Check every minute
    const interval = setInterval(checkReminders, 60000);
    checkReminders(); // Check immediately

    return () => clearInterval(interval);
  }, [medications, profile]);
};
