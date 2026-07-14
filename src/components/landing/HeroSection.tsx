import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ECGLine } from "./ECGLine";

export const HeroSection = () => {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const opacity = Math.max(0, 1 - scrollY / 600);
  const translateY = scrollY * 0.15;

  return (
    <section className="relative min-h-[100vh] flex items-center justify-center overflow-hidden">
      {/* ECG Lines — THE WOW ELEMENT — staggered draw-on animation */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-center">
        {/* Line 1 — top, subtle */}
        <div
          className="absolute top-[18%] left-0 right-0"
          style={{
            opacity: mounted ? 0.2 : 0,
            transform: `translateY(${translateY * 0.3}px)`,
            transition: "opacity 0.5s ease",
          }}
        >
          <ECGLine className="h-20 sm:h-24" strokeWidth={2} glowIntensity={0.6} speed={2.5} delay={800} />
        </div>

        {/* Line 2 — MAIN CENTER LINE — bold and glowing */}
        <div
          className="absolute top-[46%] left-0 right-0 -translate-y-1/2"
          style={{
            opacity: mounted ? 0.5 : 0,
            transform: `translateY(${translateY * 0.15}px)`,
            transition: "opacity 0.8s ease",
          }}
        >
          <ECGLine className="h-28 sm:h-36 md:h-44" strokeWidth={3} glowIntensity={1.5} speed={2} delay={200} />
        </div>

        {/* Line 3 — lower, medium */}
        <div
          className="absolute top-[72%] left-0 right-0"
          style={{
            opacity: mounted ? 0.15 : 0,
            transform: `translateY(${translateY * 0.5}px)`,
            transition: "opacity 0.6s ease",
          }}
        >
          <ECGLine className="h-16 sm:h-20" strokeWidth={1.5} glowIntensity={0.4} speed={3} delay={1400} />
        </div>
      </div>

      {/* Content */}
      <div
        className="relative z-10 max-w-5xl mx-auto px-6 text-center"
        style={{ opacity, transform: `translateY(${translateY}px)` }}
      >
        {/* Minimal badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-landing-card/80 backdrop-blur-sm border border-landing-border text-xs font-medium text-landing-muted mb-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute h-full w-full rounded-full bg-landing-primary opacity-75" />
            <span className="relative rounded-full h-2 w-2 bg-landing-primary" />
          </span>
          Built for Indian families
        </div>

        {/* Headline */}
        <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-bold tracking-tight leading-[0.95] mb-8 text-landing-text">
          One heartbeat.
          <br />
          <span className="text-landing-primary">Two cities.</span>
        </h1>

        {/* Subhead */}
        <p className="text-base sm:text-lg lg:text-xl text-landing-muted mb-12 max-w-2xl mx-auto leading-relaxed">
          Your parents' BP, sugar, and heart health — tracked daily, shared
          instantly. Whether they're in Delhi and you're in Bangalore, you'll
          always know they're okay.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
          <Button
            size="lg"
            onClick={() => navigate("/auth")}
            className="h-14 rounded-full px-10 text-base font-semibold bg-landing-primary hover:bg-landing-primary/90 text-white shadow-lg shadow-landing-primary/25 hover:shadow-xl hover:shadow-landing-primary/30 transition-all hover:scale-[1.02]"
          >
            Start Free Today
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-14 rounded-full px-10 text-base font-semibold border-landing-border text-landing-text hover:bg-landing-card"
            onClick={() => navigate("/features/heartscore")}
          >
            See How It Works
          </Button>
        </div>

        {/* Trust stamps */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-landing-muted">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-landing-secondary" />
            100% Offline capable
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-landing-secondary" />
            Bank-grade encryption
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-landing-primary" />
            Made in India
          </span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-landing-muted/50"
        style={{ opacity: Math.max(0, 1 - scrollY / 200) }}
      >
        <span className="text-[10px] uppercase tracking-[0.2em] font-medium">
          Scroll
        </span>
        <div className="w-px h-8 bg-gradient-to-b from-landing-muted/30 to-transparent animate-pulse" />
      </div>
    </section>
  );
};
