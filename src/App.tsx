import { Toaster as SonnerToaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { BottomNav } from "@/components/BottomNav";
import { PageTransition } from "@/components/PageTransition";
import { useMedicationReminders } from "@/hooks/useMedicationReminders";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/useAuth";
import { lazy, Suspense } from "react";
import RootRedirect from "@/components/RootRedirect";

// Lazy load pages
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Rituals = lazy(() => import("./pages/Rituals"));
const MorningCheckin = lazy(() => import("./pages/MorningCheckin"));
const EveningCheckin = lazy(() => import("./pages/EveningCheckin"));
const Insights = lazy(() => import("./pages/Insights"));
const Family = lazy(() => import("./pages/Family"));
const AICoach = lazy(() => import("./pages/AICoach"));
const Medications = lazy(() => import("./pages/Medications"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));
const Shop = lazy(() => import("./pages/Shop"));
const Challenges = lazy(() => import("./pages/Challenges"));
const Subscription = lazy(() => import("./pages/Subscription"));
const About = lazy(() => import("./pages/About"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Contact = lazy(() => import("./pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Feature pages
const HeartScoreFeature = lazy(() => import("./pages/features/HeartScoreFeature"));
const FamilyFeature = lazy(() => import("./pages/features/FamilyFeature"));
const SafetyFeature = lazy(() => import("./pages/features/SafetyFeature"));
const MedicationsFeature = lazy(() => import("./pages/features/MedicationsFeature"));
const CognitiveFeature = lazy(() => import("./pages/features/CognitiveFeature"));
const SocialFeature = lazy(() => import("./pages/features/SocialFeature"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-transparent">
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground font-medium animate-pulse">Syncing Health Data...</p>
    </div>
  </div>
);

// Global Background Component
const CinematicBackground = () => (
  <>
    <div
      className="fixed inset-0 pointer-events-none z-[-1] opacity-[0.03]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }}
    ></div>
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-2]">
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-primary/20 rounded-full blur-[120px] animate-blob mix-blend-multiply dark:mix-blend-screen opacity-50"></div>
      <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-accent/20 rounded-full blur-[120px] animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen opacity-50"></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[50vw] h-[50vw] bg-secondary/20 rounded-full blur-[120px] animate-blob animation-delay-4000 mix-blend-multiply dark:mix-blend-screen opacity-50"></div>
    </div>
  </>
);

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const showBottomNav = location.pathname.startsWith("/app/");

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useMedicationReminders();

  return (
    <>
      <CinematicBackground />
      <Suspense fallback={<LoadingFallback />}>
        <PageTransition key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/features/heartscore" element={<HeartScoreFeature />} />
            <Route path="/features/family" element={<FamilyFeature />} />
            <Route path="/features/safety" element={<SafetyFeature />} />
            <Route path="/features/medications" element={<MedicationsFeature />} />
            <Route path="/features/cognitive" element={<CognitiveFeature />} />
            <Route path="/features/social" element={<SocialFeature />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/app/home" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/app/checkin" element={<ProtectedRoute><Rituals /></ProtectedRoute>} />
            <Route path="/app/checkin/morning" element={<ProtectedRoute><MorningCheckin /></ProtectedRoute>} />
            <Route path="/app/checkin/evening" element={<ProtectedRoute><EveningCheckin /></ProtectedRoute>} />
            <Route path="/app/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
            <Route path="/app/family" element={<ProtectedRoute><Family /></ProtectedRoute>} />
            <Route path="/app/coach" element={<ProtectedRoute><AICoach /></ProtectedRoute>} />
            <Route path="/app/medications" element={<ProtectedRoute><Medications /></ProtectedRoute>} />
            <Route path="/app/achievements" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
            <Route path="/app/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/app/shop" element={<ProtectedRoute><Shop /></ProtectedRoute>} />
            <Route path="/app/challenges" element={<ProtectedRoute><Challenges /></ProtectedRoute>} />
            <Route path="/app/subscription" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PageTransition>
      </Suspense>
      {showBottomNav && <BottomNav />}
    </>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AccessibilityProvider>
            <SonnerToaster 
              position="top-center" 
              toastOptions={{ 
                className: "glass-panel border-0 shadow-lg !text-foreground",
                style: {
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  border: '1px solid hsl(var(--border))',
                }
              }} 
            />
            <PWAInstallPrompt />
            <BrowserRouter>
              <AuthProvider>
                <AppContent />
              </AuthProvider>
            </BrowserRouter>
          </AccessibilityProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
