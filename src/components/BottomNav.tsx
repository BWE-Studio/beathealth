import { Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "@/lib/haptics";
import beatLogo from "@/assets/beat-logo.png";
import { useState } from "react";
import { HealthSummarySheet } from "@/components/HealthSummarySheet";
import { useLanguage } from "@/contexts/LanguageContext";

// Simplified 3-item navigation for senior-friendly UX
const navItems = [
  { icon: Heart, labelKey: "nav.health", action: "health_sheet" },
  { icon: null, labelKey: "nav.beat", path: "/app/coach", highlight: true, useLogo: true },
  { icon: User, labelKey: "nav.me", path: "/app/profile" },
];

export const BottomNav = () => {
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();
  const [healthSheetOpen, setHealthSheetOpen] = useState(false);
  const { t } = useLanguage();

  const handleNavClick = (item: typeof navItems[0]) => {
    haptic('light');
    if (item.action === "health_sheet") {
      setHealthSheetOpen(true);
    } else if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <>
      {healthSheetOpen && (
        <HealthSummarySheet isOpen={healthSheetOpen} onClose={() => setHealthSheetOpen(false)} />
      )}
      
      <nav id="bottom-nav" className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border md:hidden transition-all duration-300 safe-area-bottom">
        <div className="flex justify-around items-center h-20 px-2">
          {navItems.map((item, index) => {
            const isActive = item.path ? pathname === item.path : false;
            const Icon = item.icon;
            
            return (
              <button
                key={index}
                onClick={() => handleNavClick(item)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-1 min-w-[72px] py-2",
                  "transition-all duration-200 active:scale-95 touch-manipulation",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                  item.highlight && !isActive && "text-primary/70"
                )}
              >
                {item.useLogo ? (
                  <div className={cn(
                    "relative -mt-6 p-3.5 rounded-full shadow-xl transition-all duration-300",
                    "bg-primary ring-4 ring-background",
                    isActive && "scale-110 shadow-primary/40"
                  )}>
                    <img 
                      src={beatLogo} 
                      alt="Beat" 
                      className="h-8 w-8 brightness-0 invert"
                    />
                  </div>
                ) : (
                  <div className={cn(
                    "relative p-2.5 rounded-2xl transition-all duration-200",
                    isActive && "bg-primary/10"
                  )}>
                    {Icon && <Icon className={cn(
                      "h-6 w-6 transition-all duration-200",
                      isActive && "stroke-[2.5]"
                    )} />}
                  </div>
                )}
                <span className={cn(
                  "text-xs font-medium transition-all duration-200",
                  isActive && "font-semibold text-primary",
                  item.highlight && "mt-1"
                )}>
                  {t(item.labelKey)}
                </span>
                {isActive && !item.highlight && (
                  <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
