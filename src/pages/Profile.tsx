import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  User, 
  Bell, 
  Shield, 
  Download, 
  Trash2, 
  Camera,
  Save,
  ArrowLeft,
  Crown,
  Bot
} from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { AgentPreferences } from "@/components/AgentPreferences";
import { AgentMemoryView } from "@/components/AgentMemoryView";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { DataSourcesManager } from "@/components/DataSourcesManager";
import { FallDetectionMonitor } from "@/components/FallDetectionMonitor";
import { LabTestTracker } from "@/components/LabTestTracker";
import { AppointmentManager } from "@/components/AppointmentManager";
import { ReferralProgram } from "@/components/ReferralProgram";
import { WhatsAppSetup } from "@/components/WhatsAppSetup";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Profile = () => {
  const navigate = useNavigate();
  const { subscription, isPremium, createCheckout, isCreatingCheckout } = useSubscription();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [profile, setProfile] = useState<any>(null);
  const [notifications, setNotifications] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    weight_kg: "",
    height_cm: "",
    date_of_birth: "",
    has_diabetes: false,
    has_hypertension: false,
    has_heart_disease: false,
    smoking_status: "unknown",
    cholesterol_ratio: "",
    last_hba1c: "",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    push_enabled: true,
    email_enabled: true,
    whatsapp_enabled: true,
    daily_reminder_enabled: true,
    weekly_summary_enabled: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, notifRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setFormData({
          full_name: profileRes.data.full_name || "",
          email: profileRes.data.email || "",
          phone: profileRes.data.phone || "",
          weight_kg: profileRes.data.weight_kg?.toString() || "",
          height_cm: profileRes.data.height_cm?.toString() || "",
          date_of_birth: profileRes.data.date_of_birth || "",
          has_diabetes: profileRes.data.has_diabetes || false,
          has_hypertension: profileRes.data.has_hypertension || false,
          has_heart_disease: profileRes.data.has_heart_disease || false,
          smoking_status: profileRes.data.smoking_status || "unknown",
          cholesterol_ratio: profileRes.data.cholesterol_ratio?.toString() || "",
          last_hba1c: profileRes.data.last_hba1c?.toString() || "",
        });
      }

      if (notifRes.data) {
        setNotifications(notifRes.data);
        setNotificationSettings({
          push_enabled: notifRes.data.push_enabled ?? true,
          email_enabled: notifRes.data.email_enabled ?? true,
          whatsapp_enabled: notifRes.data.whatsapp_enabled ?? true,
          daily_reminder_enabled: notifRes.data.daily_reminder_enabled ?? true,
          weekly_summary_enabled: notifRes.data.weekly_summary_enabled ?? true,
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        toast.error("File size must be less than 2MB");
        return;
      }

      setIsUploadingAvatar(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      toast.success("Profile photo updated");
      fetchData();
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error("Failed to upload photo");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await Promise.all([
        supabase.from("profiles").update({
          full_name: formData.full_name || null,
          phone: formData.phone || null,
          weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
          height_cm: formData.height_cm ? parseInt(formData.height_cm) : null,
          date_of_birth: formData.date_of_birth || null,
          has_diabetes: formData.has_diabetes,
          has_hypertension: formData.has_hypertension,
          has_heart_disease: formData.has_heart_disease,
          smoking_status: formData.smoking_status,
          cholesterol_ratio: formData.cholesterol_ratio ? parseFloat(formData.cholesterol_ratio) : null,
          last_hba1c: formData.last_hba1c ? parseFloat(formData.last_hba1c) : null,
          last_hba1c_date: formData.last_hba1c ? new Date().toISOString().split('T')[0] : null,
        }).eq("id", user.id),
        
        supabase.from("notification_preferences").upsert({
          user_id: user.id,
          ...notificationSettings,
        }),
      ]);

      toast.success("Profile saved successfully");
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileData, bpLogs, sugarLogs, behaviorLogs, medications] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("bp_logs").select("*").eq("user_id", user.id),
        supabase.from("sugar_logs").select("*").eq("user_id", user.id),
        supabase.from("behavior_logs").select("*").eq("user_id", user.id),
        supabase.from("medications").select("*").eq("user_id", user.id),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        profile: profileData.data,
        bp_logs: bpLogs.data,
        sugar_logs: sugarLogs.data,
        behavior_logs: behaviorLogs.data,
        medications: medications.data,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `beat-health-data-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Data exported successfully");
    } catch (error) {
      console.error("Error exporting data:", error);
      toast.error("Failed to export data");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("No active session found");
        return;
      }

      const { error } = await supabase.functions.invoke(
        "delete-user",
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (error) throw error;

      await supabase.auth.signOut();

      toast.success("Account deleted successfully");
      navigate("/");
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error("Failed to delete account");
    }
  };

  const initials = profile?.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase() || "U";

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 pb-24">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded-xl" />
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-6 pb-24 max-w-2xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/app/home")}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        {/* Profile Header */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="w-20 h-20 border-4 border-primary">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute -bottom-1 -right-1 h-8 w-8 p-0 rounded-full"
              >
                <Camera className="w-4 h-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{profile?.full_name || "User"}</h1>
              <p className="text-muted-foreground">{profile?.email}</p>
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-0.5 rounded-full mt-1">
                  <Crown className="w-3 h-3" /> Premium
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Personal Information */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Personal Information</h2>
          </div>
          
          <div className="grid gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="weight_kg">Weight (kg)</Label>
                <Input
                  id="weight_kg"
                  type="number"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                  placeholder="70"
                />
              </div>
              <div>
                <Label htmlFor="height_cm">Height (cm)</Label>
                <Input
                  id="height_cm"
                  type="number"
                  value={formData.height_cm}
                  onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                  placeholder="170"
                />
              </div>
              <div>
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Health Conditions</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={formData.has_diabetes}
                    onCheckedChange={(checked) => setFormData({ ...formData, has_diabetes: checked })}
                  />
                  <span className="text-sm">Diabetes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={formData.has_hypertension}
                    onCheckedChange={(checked) => setFormData({ ...formData, has_hypertension: checked })}
                  />
                  <span className="text-sm">Hypertension</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={formData.has_heart_disease}
                    onCheckedChange={(checked) => setFormData({ ...formData, has_heart_disease: checked })}
                  />
                  <span className="text-sm">Heart Disease</span>
                </label>
              </div>
            </div>

            <Separator />

            {/* Advanced Health Metrics */}
            <div className="space-y-4">
              <Label>Advanced Health Metrics (Optional)</Label>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="smoking_status" className="text-xs text-muted-foreground">Smoking Status</Label>
                  <select
                    id="smoking_status"
                    value={formData.smoking_status}
                    onChange={(e) => setFormData({ ...formData, smoking_status: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="unknown">Unknown</option>
                    <option value="never">Never Smoked</option>
                    <option value="former">Former Smoker</option>
                    <option value="current">Current Smoker</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="cholesterol_ratio" className="text-xs text-muted-foreground">Cholesterol Ratio</Label>
                  <Input
                    id="cholesterol_ratio"
                    type="number"
                    step="0.1"
                    value={formData.cholesterol_ratio}
                    onChange={(e) => setFormData({ ...formData, cholesterol_ratio: e.target.value })}
                    placeholder="e.g. 4.5"
                  />
                </div>
                <div>
                  <Label htmlFor="last_hba1c" className="text-xs text-muted-foreground">Last HbA1c (%)</Label>
                  <Input
                    id="last_hba1c"
                    type="number"
                    step="0.1"
                    value={formData.last_hba1c}
                    onChange={(e) => setFormData({ ...formData, last_hba1c: e.target.value })}
                    placeholder="e.g. 6.5"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                These metrics improve AI risk predictions. Ask your doctor for these values.
              </p>
            </div>
          </div>
        </Card>

        {/* Push Notifications */}
        <div className="mb-6">
          <PushNotificationToggle />
        </div>

        {/* WhatsApp Setup */}
        <div className="mb-6">
          <WhatsAppSetup />
        </div>

        {/* Referral Program */}
        <div className="mb-6">
          <ReferralProgram />
        </div>

        {/* Notifications */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Notification Preferences</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">WhatsApp Messages</p>
                <p className="text-sm text-muted-foreground">Daily reminders via WhatsApp</p>
              </div>
              <Switch
                checked={notificationSettings.whatsapp_enabled}
                onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, whatsapp_enabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Daily Reminders</p>
                <p className="text-sm text-muted-foreground">Morning and evening check-in reminders</p>
              </div>
              <Switch
                checked={notificationSettings.daily_reminder_enabled}
                onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, daily_reminder_enabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly Summary</p>
                <p className="text-sm text-muted-foreground">Weekly health insights report</p>
              </div>
              <Switch
                checked={notificationSettings.weekly_summary_enabled}
                onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, weekly_summary_enabled: checked })}
              />
            </div>
          </div>
        </Card>

        {/* Agent Settings */}
        <div className="mb-6">
          <AgentPreferences />
        </div>

        {/* Agent Memory - What Beat Knows */}
        <div className="mb-6">
          <AgentMemoryView />
        </div>

        {/* Safety Features */}
        <div className="mb-6">
          <FallDetectionMonitor />
        </div>

        {/* Lab Tests & Appointments */}
        <div className="mb-6 space-y-4">
          <LabTestTracker />
          <AppointmentManager />
        </div>

        {/* Subscription */}
        {!isPremium && (
          <Card className="p-6 mb-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Upgrade to Premium</h2>
            </div>
            <p className="text-muted-foreground mb-4">
              Unlock Beat AI Coach, PDF reports, advanced insights, and priority support.
            </p>
            <Button
              onClick={() => createCheckout("premium")}
              disabled={isCreatingCheckout}
              className="w-full md:w-auto"
            >
              {isCreatingCheckout ? "Loading..." : "Upgrade to Premium - ₹199/month"}
            </Button>
          </Card>
        )}

        {/* Data & Privacy */}
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Data & Privacy</h2>
          </div>
          
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={handleExportData}
              className="w-full justify-start"
            >
              <Download className="w-4 h-4 mr-2" />
              Export My Data
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full justify-start">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete My Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your
                    account and remove all your health data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground">
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 text-lg"
        >
          <Save className="w-5 h-5 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

export default Profile;
