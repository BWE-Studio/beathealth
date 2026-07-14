import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const location = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(false);

  useEffect(() => {
    if (!requireAdmin || authLoading || !user?.id) {
      setIsAdmin(false);
      setIsCheckingAdmin(false);
      return;
    }

    let cancelled = false;

    const checkAdmin = async () => {
      try {
        setIsCheckingAdmin(true);
        const { data: hasAdminRole } = await supabase.rpc("has_role", {
          _user_id: user.id,
          _role: "admin",
        });

        if (!cancelled) {
          setIsAdmin(!!hasAdminRole);
        }
      } catch (error) {
        console.error("Admin check error:", error);
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingAdmin(false);
        }
      }
    };

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [authLoading, requireAdmin, user?.id]);

  if (authLoading || isCheckingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-2xl bg-black flex items-center justify-center animate-pulse">
            <Logo size="xl" showText={false} />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/app/home" replace />;
  }

  return <>{children}</>;
};
