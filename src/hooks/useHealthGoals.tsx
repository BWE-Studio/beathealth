import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface HealthGoal {
  id: string;
  user_id: string;
  goal_type: 'bp_control' | 'weight_loss' | 'step_count' | 'sugar_control' | 'consistency';
  target_value: number;
  current_value: number | null;
  start_date: string;
  target_date: string | null;
  status: 'active' | 'completed' | 'abandoned';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useHealthGoals = (userId?: string) => {
  const queryClient = useQueryClient();

  // Auto-sync goal progress from latest readings
  const syncGoalProgress = async (goalId: string, goalType: string, targetUserId: string) => {
    let currentValue = null;

    try {
      if (goalType === 'bp_control') {
        // Get latest BP reading
        const { data } = await supabase
          .from('bp_logs')
          .select('systolic, diastolic')
          .eq('user_id', targetUserId)
          .order('measured_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data) {
          currentValue = data.systolic; // Use systolic as the current value
        }
      } else if (goalType === 'sugar_control') {
        // Get latest sugar reading
        const { data } = await supabase
          .from('sugar_logs')
          .select('glucose_mg_dl')
          .eq('user_id', targetUserId)
          .order('measured_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data) {
          currentValue = data.glucose_mg_dl;
        }
      } else if (goalType === 'weight_loss') {
        // Get current weight from profile
        const { data } = await supabase
          .from('profiles')
          .select('weight_kg')
          .eq('id', targetUserId)
          .single();
        
        if (data?.weight_kg) {
          currentValue = data.weight_kg;
        }
      } else if (goalType === 'step_count') {
        // Get today's step count
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
          .from('behavior_logs')
          .select('steps_count')
          .eq('user_id', targetUserId)
          .eq('log_date', today)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data?.steps_count) {
          currentValue = data.steps_count;
        }
      }

      if (currentValue !== null) {
        await supabase
          .from('health_goals')
          .update({ current_value: currentValue })
          .eq('id', goalId);
      }
    } catch (error) {
      console.error('Error syncing goal progress:', error);
    }
  };

  const { data: goals, isLoading } = useQuery({
    queryKey: ["health-goals", userId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;

      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from("health_goals")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Auto-sync current values for all active goals
      const activeGoals = (data as HealthGoal[])?.filter(g => g.status === 'active') || [];
      for (const goal of activeGoals) {
        syncGoalProgress(goal.id, goal.goal_type, targetUserId);
      }
      
      return data as HealthGoal[];
    },
    enabled: !!userId || true,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes to sync progress
  });

  const createGoal = useMutation({
    mutationFn: async (newGoal: {
      goal_type: string;
      target_value: number;
      target_date?: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("health_goals")
        .insert({
          user_id: user.id,
          ...newGoal,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-goals"] });
      toast.success("Goal created successfully!");
    },
    onError: (error) => {
      console.error("Error creating goal:", error);
      toast.error("Failed to create goal");
    },
  });

  const updateGoal = useMutation({
    mutationFn: async ({
      goalId,
      updates,
    }: {
      goalId: string;
      updates: Partial<HealthGoal>;
    }) => {
      const { data, error } = await supabase
        .from("health_goals")
        .update(updates)
        .eq("id", goalId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-goals"] });
      toast.success("Goal updated!");
    },
    onError: (error) => {
      console.error("Error updating goal:", error);
      toast.error("Failed to update goal");
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase
        .from("health_goals")
        .delete()
        .eq("id", goalId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health-goals"] });
      toast.success("Goal deleted");
    },
    onError: (error) => {
      console.error("Error deleting goal:", error);
      toast.error("Failed to delete goal");
    },
  });

  return {
    goals: goals || [],
    isLoading,
    createGoal: createGoal.mutate,
    updateGoal: updateGoal.mutate,
    deleteGoal: deleteGoal.mutate,
  };
};
