import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AccessibilityContextType {
  textSize: "normal" | "large";
  highContrast: boolean;
  setTextSize: (size: "normal" | "large") => void;
  setHighContrast: (enabled: boolean) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [textSize, setTextSizeState] = useState<"normal" | "large">("normal");
  const [highContrast, setHighContrastState] = useState(false);

  useEffect(() => {
    // Load preferences from profile
    const loadPreferences = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("text_size_preference, high_contrast_mode")
          .eq("id", user.id)
          .single();
        
        if (data) {
          setTextSizeState(data.text_size_preference as "normal" | "large" || "normal");
          setHighContrastState(data.high_contrast_mode || false);
        }
      }
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    if (textSize === "large") {
      document.body.classList.add("text-large");
    } else {
      document.body.classList.remove("text-large");
    }
  }, [textSize]);

  useEffect(() => {
    if (highContrast) {
      document.body.classList.add("high-contrast");
    } else {
      document.body.classList.remove("high-contrast");
    }
  }, [highContrast]);

  const setTextSize = async (size: "normal" | "large") => {
    setTextSizeState(size);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ text_size_preference: size })
        .eq("id", user.id);
    }
  };

  const setHighContrast = async (enabled: boolean) => {
    setHighContrastState(enabled);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ high_contrast_mode: enabled })
        .eq("id", user.id);
    }
  };

  return (
    <AccessibilityContext.Provider value={{ textSize, highContrast, setTextSize, setHighContrast }}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within AccessibilityProvider");
  }
  return context;
};
