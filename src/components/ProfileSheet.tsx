import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  User, Settings, Bell, Shield, Smartphone, LogOut, ChevronRight, 
  Crown, Moon, Sun, Palette, Trophy, HelpCircle
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/components/ThemeProvider";
import { Switch } from "@/components/ui/switch";

interface ProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileSheet = ({ isOpen, onClose }: ProfileSheetProps) => {
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id && isOpen,
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && isOpen,
  });

  const handleLogout = async () => {
    haptic('medium');
    await supabase.auth.signOut();
    toast.success(language === 'hi' ? 'लॉग आउट सफल' : 'Logged out successfully');
    onClose();
    navigate('/auth');
  };

  const handleNavigate = (path: string) => {
    haptic('light');
    onClose();
    navigate(path);
  };

  const menuItems = [
    { 
      icon: User, 
      label: language === 'hi' ? 'प्रोफ़ाइल संपादित करें' : 'Edit Profile',
      action: () => handleNavigate('/app/profile'),
    },
    { 
      icon: Trophy, 
      label: language === 'hi' ? 'उपलब्धियां' : 'Achievements',
      action: () => handleNavigate('/app/achievements'),
    },
    { 
      icon: Bell, 
      label: language === 'hi' ? 'सूचनाएं' : 'Notifications',
      action: () => handleNavigate('/app/profile'),
    },
    { 
      icon: Smartphone, 
      label: language === 'hi' ? 'उपकरण' : 'Connected Devices',
      action: () => handleNavigate('/app/profile'),
    },
    { 
      icon: Shield, 
      label: language === 'hi' ? 'गोपनीयता' : 'Privacy & Security',
      action: () => handleNavigate('/privacy'),
    },
    { 
      icon: HelpCircle, 
      label: language === 'hi' ? 'सहायता' : 'Help & Support',
      action: () => handleNavigate('/contact'),
    },
  ];

  const isPremium = subscription?.plan_type === 'premium' && subscription?.status === 'active';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            {language === 'hi' ? 'सेटिंग्स' : 'Settings'}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-8">
          {/* Profile Card */}
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {profile?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{profile?.full_name || 'User'}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                {isPremium && (
                  <div className="flex items-center gap-1 mt-1">
                    <Crown className="h-4 w-4 text-amber-500" />
                    <span className="text-xs text-amber-600 font-medium">Premium</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Premium Upgrade */}
          {!isPremium && (
            <Button 
              className="w-full h-14 gap-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              onClick={() => handleNavigate('/app/subscription')}
            >
              <Crown className="h-5 w-5" />
              {language === 'hi' ? 'प्रीमियम में अपग्रेड करें' : 'Upgrade to Premium'}
            </Button>
          )}

          {/* Quick Settings */}
          <Card className="divide-y divide-border">
            {/* Theme Toggle */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <span className="font-medium">{language === 'hi' ? 'डार्क मोड' : 'Dark Mode'}</span>
              </div>
              <Switch 
                checked={theme === 'dark'} 
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>

            {/* Language Toggle */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5" />
                <span className="font-medium">{language === 'hi' ? 'भाषा' : 'Language'}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              >
                {language === 'en' ? 'हिंदी' : 'English'}
              </Button>
            </div>
          </Card>

          {/* Menu Items */}
          <Card className="divide-y divide-border">
            {menuItems.map((item, index) => (
              <button
                key={index}
                onClick={item.action}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">{item.label}</span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            ))}
          </Card>

          {/* Logout */}
          <Button 
            variant="outline" 
            className="w-full h-12 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            {language === 'hi' ? 'लॉग आउट' : 'Log Out'}
          </Button>

          {/* App Info */}
          <p className="text-center text-xs text-muted-foreground">
            Beat v1.0.0 • Made with ❤️ for healthy aging
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
