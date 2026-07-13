import { Activity, Droplets, Moon, Footprints } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { haptic } from "@/lib/haptics";
import { useState } from "react";
import { UnifiedCheckin } from "@/components/UnifiedCheckin";
import { ThemedIcon } from "./ThemedIcon";

export const QuickLogActions = () => {
  const { language } = useLanguage();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinType, setCheckinType] = useState<"morning" | "evening">("morning");
  const [initialShortcut, setInitialShortcut] = useState<"bp" | "sugar" | "sleep" | "steps">("bp");

  const handleAction = (type: "morning" | "evening", shortcut: "bp" | "sugar" | "sleep" | "steps") => {
    haptic("medium");
    setCheckinType(type);
    setInitialShortcut(shortcut);
    setCheckinOpen(true);
  };

  const actions = [
    {
      label: language === "hi" ? "बीपी" : "BP",
      icon: Activity,
      type: "morning" as const,
      shortcut: "bp" as const,
      variant: "primary" as const,
    },
    {
      label: language === "hi" ? "शुगर" : "Sugar",
      icon: Droplets,
      type: "morning" as const,
      shortcut: "sugar" as const,
      variant: "secondary" as const,
    },
    {
      label: language === "hi" ? "नींद" : "Sleep",
      icon: Moon,
      type: "morning" as const,
      shortcut: "sleep" as const,
      variant: "accent" as const,
    },
    {
      label: language === "hi" ? "कदम" : "Steps",
      icon: Footprints,
      type: "evening" as const,
      shortcut: "steps" as const,
      variant: "success" as const,
    },
  ];

  return (
    <>
      <UnifiedCheckin 
        isOpen={checkinOpen} 
        onClose={() => setCheckinOpen(false)} 
        type={checkinType}
        initialShortcut={initialShortcut}
      />
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleAction(action.type, action.shortcut)}
            className="group flex flex-col items-center gap-2 p-3 sm:p-4 rounded-2xl bg-card border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
          >
            <ThemedIcon 
              icon={action.icon} 
              size="lg" 
              variant={action.variant} 
              withGlow 
              className="group-hover:scale-110 transition-transform duration-300 shadow-md"
            />
            <span className="text-xs sm:text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </>
  );
};
