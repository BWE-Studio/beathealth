import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const validationRunRef = useRef(0);
  const initialAuthResolvedRef = useRef(false);

  useEffect(() => {
    const clearAuthState = () => {
      validationRunRef.current += 1;
      setSession(null);
      setUser(null);
      setLoading(false);
      initialAuthResolvedRef.current = true;
    };

    const validateSession = async (nextSession: Session | null) => {
      const runId = validationRunRef.current + 1;
      validationRunRef.current = runId;

      if (!nextSession) {
        setSession(null);
        setUser(null);
        setLoading(false);
        initialAuthResolvedRef.current = true;
        return;
      }

      if (!initialAuthResolvedRef.current) {
        setLoading(true);
      }

      const { data, error } = await supabase.auth.getUser();
      if (validationRunRef.current !== runId) return;

      if (error || !data.user) {
        await supabase.auth.signOut({ scope: "local" });
        if (validationRunRef.current !== runId) return;

        setSession(null);
        setUser(null);
        setLoading(false);
        initialAuthResolvedRef.current = true;
        return;
      }

      setSession(nextSession);
      setUser(data.user);
      setLoading(false);
      initialAuthResolvedRef.current = true;
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          clearAuthState();
          return;
        }

        setTimeout(() => {
          void validateSession(session);
        }, 0);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      void validateSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setLoading(false);
    initialAuthResolvedRef.current = true;
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: !!session,
      signOut,
    }),
    [user, session, loading, signOut]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
