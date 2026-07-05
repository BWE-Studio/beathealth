import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useNavigate, Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

export const LandingNav = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed w-full z-50 top-0 bg-landing-bg/80 backdrop-blur-xl border-b border-landing-border/50"
        style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Logo size="sm" showText={true} />

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              to="/features/heartscore"
              className="text-sm font-medium text-landing-muted hover:text-landing-primary transition-colors"
            >
              Features
            </Link>
            <a
              href="#pricing"
              className="text-sm font-medium text-landing-muted hover:text-landing-primary transition-colors"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="text-sm font-medium text-landing-muted hover:text-landing-primary transition-colors"
            >
              Stories
            </a>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full w-10 h-10"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={() => navigate("/auth")}
              className="rounded-full px-6 h-10 bg-landing-primary hover:bg-landing-primary/90 text-white font-medium"
            >
              Start Free
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-landing-text"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-landing-card border-t border-landing-border p-6 space-y-4 animate-fade-in">
          <Link
            to="/features/heartscore"
            className="block text-base font-medium text-landing-text"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Features
          </Link>
          <a
            href="#pricing"
            className="block text-base font-medium text-landing-text"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Pricing
          </a>
          <a
            href="#faq"
            className="block text-base font-medium text-landing-text"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Stories
          </a>
          <div className="flex items-center justify-between pt-4 border-t border-landing-border">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={() => {
                navigate("/auth");
                setIsMobileMenuOpen(false);
              }}
              className="rounded-full px-6 bg-landing-primary hover:bg-landing-primary/90 text-white"
            >
              Start Free
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
};
