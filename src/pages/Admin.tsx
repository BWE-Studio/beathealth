import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Users, 
  TrendingUp, 
  Activity, 
  Crown,
  ArrowLeft,
  Search,
  Flag,
  Calendar
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface KPI {
  label: string;
  value: string | number;
  change?: string;
  icon: React.ReactNode;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  onboarding_completed: boolean;
}

interface FeatureFlag {
  key: string;
  value_json: any;
  description: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch user count
      const totalUsersRes = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      const { count: totalUsers } = totalUsersRes;

      // Fetch users created in last 7 days
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const newUsersRes = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString());
      const { count: newUsers } = newUsersRes;

      // Fetch active streaks
      const { count: activeStreaks } = await supabase
        .from("streaks")
        .select("*", { count: "exact", head: true })
        .gte("count", 7);

      // Fetch premium users
      const { count: premiumUsers } = await supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("plan_type", "premium")
        .eq("status", "active");

      setKpis([
        { label: "Total Users", value: totalUsers || 0, change: "+12%", icon: <Users className="w-6 h-6" /> },
        { label: "New This Week", value: newUsers || 0, change: "+8%", icon: <TrendingUp className="w-6 h-6" /> },
        { label: "7-Day Streaks", value: activeStreaks || 0, change: "+15%", icon: <Activity className="w-6 h-6" /> },
        { label: "Premium Users", value: premiumUsers || 0, change: "+5%", icon: <Crown className="w-6 h-6" /> },
      ]);

      // Fetch users list
      const usersRes = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at, onboarding_completed")
        .order("created_at", { ascending: false })
        .limit(50);
      const { data: usersData } = usersRes;

      setUsers(usersData || []);

      // Fetch feature flags
      const { data: flagsData } = await supabase
        .from("feature_flags")
        .select("*");

      setFeatureFlags(flagsData || []);
    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const toggleFeatureFlag = async (key: string, currentValue: any) => {
    try {
      const newValue = typeof currentValue === "boolean" ? !currentValue : { ...currentValue, enabled: !currentValue.enabled };
      
      await supabase
        .from("feature_flags")
        .update({ value_json: newValue })
        .eq("key", key);

      toast.success(`Feature flag "${key}" updated`);
      fetchDashboardData();
    } catch (error) {
      console.error("Error updating feature flag:", error);
      toast.error("Failed to update feature flag");
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/app/home")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi, index) => (
            <Card key={index} className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-sm">{kpi.label}</span>
                <div className="text-primary">{kpi.icon}</div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{kpi.value}</span>
                {kpi.change && (
                  <span className="text-xs text-green-500 font-medium">{kpi.change}</span>
                )}
              </div>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="flags">
              <Flag className="w-4 h-4 mr-2" />
              Feature Flags
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Onboarded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.full_name || "—"}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(user.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            user.onboarding_completed
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          }`}
                        >
                          {user.onboarding_completed ? "Yes" : "No"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="flags">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Feature Flags</h3>
              <div className="space-y-4">
                {featureFlags.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No feature flags configured yet.
                  </p>
                ) : (
                  featureFlags.map((flag) => {
                    const isEnabled = typeof flag.value_json === "boolean" 
                      ? flag.value_json 
                      : flag.value_json?.enabled;
                    
                    return (
                      <div
                        key={flag.key}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{flag.key}</p>
                          <p className="text-sm text-muted-foreground">
                            {flag.description || "No description"}
                          </p>
                        </div>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => toggleFeatureFlag(flag.key, flag.value_json)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
