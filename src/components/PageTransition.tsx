import { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export const PageTransition = ({ children, className }: PageTransitionProps) => {
  const isAndroidNative = Capacitor.getPlatform() === "android";

  return (
    <div data-page-shell className={cn(!isAndroidNative && "animate-fade-in", className)}>
      {children}
    </div>
  );
};
