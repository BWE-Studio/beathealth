import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logProfileDebug } from "@/lib/runtimeDebug";

export const useTutorial = () => {
  const { user, loading: authLoading } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setIsLoading(false);
      setIsActive(false);
      return;
    }

    checkTutorialStatus(user.id);
  }, [authLoading, user?.id]);

  const checkTutorialStatus = async (userId: string) => {
    try {
      console.log("[useTutorial] AUTH USER:", user);
      const { data, error } = await supabase
        .from("profiles")
        .select("tutorial_completed, tutorial_step")
        .eq("id", userId)
        .single();

      const profileRes = { data, error };
      logProfileDebug("useTutorial.checkTutorialStatus", user, profileRes);

      if (error) throw error;

      if (!data?.tutorial_completed) {
        setIsActive(true);
        setCurrentStep(data?.tutorial_step || 0);
      }
    } catch (error) {
      console.error("Error checking tutorial status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = async () => {
    const newStep = currentStep + 1;
    setCurrentStep(newStep);
    await updateTutorialStep(newStep);
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTutorial = async () => {
    await completeTutorial();
  };

  const completeTutorial = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("profiles")
        .update({ 
          tutorial_completed: true,
          tutorial_step: 0
        })
        .eq("id", user.id);

      setIsActive(false);
    } catch (error) {
      console.error("Error completing tutorial:", error);
    }
  };

  const updateTutorialStep = async (step: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("profiles")
        .update({ tutorial_step: step })
        .eq("id", user.id);
    } catch (error) {
      console.error("Error updating tutorial step:", error);
    }
  };

  const restartTutorial = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("profiles")
        .update({ 
          tutorial_completed: false,
          tutorial_step: 0
        })
        .eq("id", user.id);

      setCurrentStep(0);
      setIsActive(true);
    } catch (error) {
      console.error("Error restarting tutorial:", error);
    }
  };

  return {
    currentStep,
    isActive,
    isLoading,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    restartTutorial,
  };
};
