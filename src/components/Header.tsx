import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useTheme } from "@/components/ThemeProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  User, 
  LogOut, 
  Activity, 
  Type, 
  Sun, 
  Moon, 
  Monitor, 
  Languages,
  Settings,
  Edit,
  Save,
  X,
  Camera
} from "lucide-react";
import { FitnessTrackerConnection } from "@/components/FitnessTrackerConnection";
import { AlertsDrawer } from "@/components/AlertsDrawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Header = () => {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { textSize, setTextSize } = useAccessibility();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    weight_kg: "",
    height_cm: "",
  });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      setEditForm({
        full_name: data?.full_name || "",
        weight_kg: data?.weight_kg?.toString() || "",
        height_cm: data?.height_cm?.toString() || "",
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file size (2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.error("File size must be less than 2MB");
        return;
      }

      setIsUploadingAvatar(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('avatars').remove([`${user.id}/${oldPath}`]);
        }
      }

      // Upload new avatar
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile with avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success("Profile photo updated");
      fetchProfile();
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error("Failed to upload photo");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editForm.full_name || null,
          weight_kg: editForm.weight_kg ? parseFloat(editForm.weight_kg) : null,
          height_cm: editForm.height_cm ? parseInt(editForm.height_cm) : null,
        })
        .eq("id", user.id);

      if (error) throw error;
      
      toast.success("Profile updated successfully");
      setIsEditingProfile(false);
      fetchProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success(t("header.signOut"));
    navigate("/");
  };

  const getThemeIcon = () => {
    if (theme === "light") return <Sun className="w-4 h-4" />;
    if (theme === "dark") return <Moon className="w-4 h-4" />;
    return <Monitor className="w-4 h-4" />;
  };

  const initials = profile?.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <header className="border-b bg-card/95 backdrop-blur-md shadow-sm sticky top-0 z-10 transition-all" 
            style={{ paddingTop: "env(safe-area-inset-top)" }} >
      <div className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
        <Logo size="md" />
        
        <div className="flex items-center gap-2">
          <AlertsDrawer />
        
        <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 h-auto py-2 px-3 hover:bg-accent/50 transition-all">
                <Avatar className="w-10 h-10 border-2 border-primary ring-2 ring-primary/10">
                  {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || "User"} />}
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-base font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-semibold">
                    {profile?.full_name || profile?.email?.split('@')[0] || "User"}
                  </span>
                  <span className="text-xs text-muted-foreground">View Profile</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-[85vh] overflow-y-auto p-0">
              {/* Profile Header Section */}
              <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-b">
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="w-16 h-16 border-2 border-primary shadow-lg">
                      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name || "User"} />}
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xl font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="absolute -bottom-1 -right-1 h-7 w-7 p-0 rounded-full shadow-md"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {!isEditingProfile ? (
                      <>
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-base truncate">
                            {profile?.full_name || profile?.email?.split('@')[0] || "User"}
                          </h3>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingProfile(true)}
                            className="h-7 w-7 p-0"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Complete your profile</p>
                        {profile?.weight_kg && (
                          <div className="flex gap-3 mt-2 text-xs">
                            <span className="bg-background/50 px-2 py-1 rounded">
                              {profile.weight_kg} kg
                            </span>
                            {profile?.height_cm && (
                              <span className="bg-background/50 px-2 py-1 rounded">
                                {profile.height_cm} cm
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          <Input
                            value={editForm.full_name}
                            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                            placeholder="Full Name"
                            className="h-7 text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSaveProfile}
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsEditingProfile(false)}
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={editForm.weight_kg}
                            onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value })}
                            placeholder="Weight (kg)"
                            type="number"
                            className="h-7 text-xs"
                          />
                          <Input
                            value={editForm.height_cm}
                            onChange={(e) => setEditForm({ ...editForm, height_cm: e.target.value })}
                            placeholder="Height (cm)"
                            type="number"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="p-2">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pb-1">
                  Quick Actions
                </DropdownMenuLabel>
                <DialogTrigger asChild>
                  <DropdownMenuItem className="cursor-pointer py-2.5">
                    <Activity className="w-4 h-4 mr-3 text-primary" />
                    <span>Connect Devices</span>
                  </DropdownMenuItem>
                </DialogTrigger>
                <DropdownMenuItem onClick={async () => {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    await supabase.from("profiles").update({ 
                      tutorial_completed: false,
                      tutorial_step: 0
                    }).eq("id", user.id);
                    window.location.reload();
                  }
                }} className="py-2.5">
                  <Settings className="w-4 h-4 mr-3 text-primary" />
                  <span>Restart Tutorial</span>
                </DropdownMenuItem>
              </div>
              
              <DropdownMenuSeparator />
              
              {/* Accessibility */}
              <div className="p-2">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pb-1">
                  Accessibility
                </DropdownMenuLabel>
                <div className="flex gap-1 px-2 pb-2">
                  <Button
                    variant={textSize === "normal" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTextSize("normal")}
                    className="flex-1 h-8"
                  >
                    <Type className="w-3.5 h-3.5 mr-1.5" />
                    Normal
                  </Button>
                  <Button
                    variant={textSize === "large" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTextSize("large")}
                    className="flex-1 h-8"
                  >
                    <Type className="w-4 h-4 mr-1.5" />
                    Large
                  </Button>
                </div>
              </div>
              
              <DropdownMenuSeparator />
              
              {/* Theme */}
              <div className="p-2">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pb-1">
                  Theme
                </DropdownMenuLabel>
                <div className="flex gap-1 px-2 pb-2">
                  <Button
                    variant={theme === "light" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("light")}
                    className="flex-1 h-8"
                  >
                    <Sun className="w-3.5 h-3.5 mr-1.5" />
                    Light
                  </Button>
                  <Button
                    variant={theme === "dark" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("dark")}
                    className="flex-1 h-8"
                  >
                    <Moon className="w-3.5 h-3.5 mr-1.5" />
                    Dark
                  </Button>
                  <Button
                    variant={theme === "system" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("system")}
                    className="flex-1 h-8"
                  >
                    <Monitor className="w-3.5 h-3.5 mr-1.5" />
                    Auto
                  </Button>
                </div>
              </div>
              
              <DropdownMenuSeparator />
              
              {/* Language */}
              <div className="p-2">
                <DropdownMenuLabel className="text-xs text-muted-foreground px-2 pb-1">
                  Language
                </DropdownMenuLabel>
                <div className="flex gap-1 px-2 pb-2">
                  <Button
                    variant={language === "en" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("en")}
                    className="flex-1 h-8"
                  >
                    <Languages className="w-3.5 h-3.5 mr-1.5" />
                    English
                  </Button>
                  <Button
                    variant={language === "hi" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("hi")}
                    className="flex-1 h-8"
                  >
                    <Languages className="w-3.5 h-3.5 mr-1.5" />
                    हिन्दी
                  </Button>
                </div>
              </div>
              
              <DropdownMenuSeparator />
              
              {/* Sign Out */}
              <div className="p-2">
                <DropdownMenuItem 
                  onClick={handleSignOut} 
                  className="text-destructive focus:text-destructive cursor-pointer py-2.5 font-medium"
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  {t("header.signOut")}
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Fitness Trackers</DialogTitle>
            </DialogHeader>
            <FitnessTrackerConnection />
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </header>
  );
};
