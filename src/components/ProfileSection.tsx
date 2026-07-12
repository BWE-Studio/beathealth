import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { User, Settings, LogOut, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FitnessTrackerConnection } from "./FitnessTrackerConnection";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

export const ProfileSection = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      setProfile(null);
      return;
    }

    fetchProfile(user.id);
  }, [authLoading, user?.id]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

  if (loading) {
    return (
      <Card className="p-4 mb-6">
        <div className="animate-pulse flex items-center gap-4">
          <div className="w-16 h-16 bg-muted rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </Card>
    );
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <Card className="p-4 md:p-6 mb-6 bg-gradient-to-r from-background to-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="w-14 h-14 md:w-16 md:h-16 border-2 border-primary">
            <AvatarFallback className="bg-primary/10 text-primary text-lg md:text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg md:text-xl font-bold">{profile?.full_name || "User"}</h2>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
            {profile?.weight_kg && (
              <p className="text-xs text-muted-foreground mt-1">
                Weight: {profile.weight_kg} kg
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Activity className="w-4 h-4" />
                <span className="hidden md:inline">Connect Devices</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Connect Fitness Trackers</DialogTitle>
              </DialogHeader>
              <FitnessTrackerConnection />
            </DialogContent>
          </Dialog>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/app/profile")}
            className="hidden md:flex gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </Card>
  );
};
