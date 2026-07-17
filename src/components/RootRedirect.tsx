import { Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/Landing";

const RootRedirect = () => {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    if (Capacitor.isNativePlatform()) {
      return <div className="min-h-screen bg-background" />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-2xl bg-black flex items-center justify-center animate-pulse">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (Capacitor.isNativePlatform()) {
    return (
      <Navigate
        to={isAuthenticated ? "/app/home" : "/auth"}
        replace
      />
    );
  }

  // Runs only in browser
  return <Landing />;
};

export default RootRedirect;
