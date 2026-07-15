import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";

type HeartScoreRecord = {
  user_id: string;
  score_date: string;
  [key: string]: unknown;
};

const upsertHistoryScore = (history: HeartScoreRecord[] | undefined, score: HeartScoreRecord) => {
  const existing = history ?? [];
  const withoutCurrentDate = existing.filter((item) => item.score_date !== score.score_date);
  return [score, ...withoutCurrentDate].sort((a, b) => b.score_date.localeCompare(a.score_date));
};

const traceJson = (value: unknown) => JSON.stringify(
  value,
  (_key, item) => {
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        stack: item.stack,
      };
    }
    return item;
  },
  2
);

const logTrace = (label: string, value: unknown) => {
  console.log(`${label}\n${traceJson(value)}`);
};

export const useHeartScore = (userId?: string) => {
  const queryClient = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      logTrace("[HeartScoreTrace] useHeartScore received explicit userId", { userId });
      setCurrentUserId(userId);
    } else {
      supabase.auth.getUser().then(({ data: { user } }) => {
        logTrace("[HeartScoreTrace] useHeartScore resolved auth user", { userId: user?.id || null });
        setCurrentUserId(user?.id || null);
      });
    }
  }, [userId]);

  // Fetch today's heart score
  const { data: todayScore, isLoading } = useQuery({
    queryKey: ["heartScore", "today", currentUserId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const queryKey = ["heartScore", "today", currentUserId];
      logTrace("[HeartScoreTrace] Today query start", {
        queryKey,
        currentUserId,
        today,
      });
      
      const { data, error } = await supabase
        .from("heart_scores")
        .select("*")
        .eq("user_id", currentUserId!)
        .eq("score_date", today)
        .maybeSingle();

      logTrace("[HeartScoreTrace] Today query response", {
        queryKey,
        fetchedRow: data,
        todayRow: data,
        error,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  // Set up real-time subscription for heart score updates
  useEffect(() => {
    if (!currentUserId) return;

    logTrace("[HeartScoreTrace] Realtime subscribe", {
      channel: `heart-scores-realtime-${currentUserId}`,
      userId: currentUserId,
    });

    const heartScoreChannel = supabase
      .channel(`heart-scores-realtime-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'heart_scores',
          filter: `user_id=eq.${currentUserId}`
        },
        (payload) => {
          logTrace("[HeartScoreTrace] Realtime event received", {
            channel: `heart-scores-realtime-${currentUserId}`,
            payload,
          });
          const updatedScore = payload.new as HeartScoreRecord | null;
          if (!updatedScore || updatedScore.user_id !== currentUserId) return;

          const today = new Date().toISOString().split("T")[0];
          if (updatedScore.score_date === today) {
            logTrace("[HeartScoreTrace] Realtime cache write", {
              queryKey: ["heartScore", "today", currentUserId],
              cachedRow: updatedScore,
            });
            queryClient.setQueryData(["heartScore", "today", currentUserId], updatedScore);
          }
          logTrace("[HeartScoreTrace] Realtime history cache write", {
            queryKey: ["heartScore", "history", currentUserId],
            cachedRow: updatedScore,
          });
          queryClient.setQueryData<HeartScoreRecord[] | undefined>(
            ["heartScore", "history", currentUserId],
            (history) => upsertHistoryScore(history, updatedScore)
          );
        }
      )
      .subscribe();

    return () => {
      logTrace("[HeartScoreTrace] Realtime unsubscribe", {
        channel: `heart-scores-realtime-${currentUserId}`,
        userId: currentUserId,
      });
      supabase.removeChannel(heartScoreChannel);
    };
  }, [currentUserId, queryClient]);

  // Calculate heart score mutation
  const calculateScore = useMutation({
    mutationFn: async (date?: string) => {
      logTrace("[HeartScoreTrace] calculateScore mutation invoke", {
        body: { date },
      });
      const { data, error } = await supabase.functions.invoke(
        "calculate-heart-score",
        {
          body: { date },
        }
      );

      logTrace("[HeartScoreTrace] calculateScore mutation response", {
        response: data,
        heartScore: data?.heartScore?.heart_score,
        bpScore: data?.heartScore?.bp_score,
        sugarScore: data?.heartScore?.sugar_score,
        returnedRow: data?.heartScore,
        error,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const updatedScore = data?.heartScore as HeartScoreRecord | undefined;
      if (updatedScore?.user_id) {
        logTrace("[HeartScoreTrace] calculateScore cache write", {
          queryKey: ["heartScore", "today", updatedScore.user_id],
          cachedRow: updatedScore,
        });
        queryClient.setQueryData(["heartScore", "today", updatedScore.user_id], updatedScore);
        logTrace("[HeartScoreTrace] calculateScore history cache write", {
          queryKey: ["heartScore", "history", updatedScore.user_id],
          cachedRow: updatedScore,
        });
        queryClient.setQueryData<HeartScoreRecord[] | undefined>(
          ["heartScore", "history", updatedScore.user_id],
          (history) => upsertHistoryScore(history, updatedScore)
        );
      } else {
        logTrace("[HeartScoreTrace] calculateScore invalidating broad heartScore", {
          queryKey: ["heartScore"],
          response: data,
        });
        queryClient.invalidateQueries({ queryKey: ["heartScore"] });
      }
      toast.success("HeartScore calculated!");
    },
    onError: (error) => {
      console.error(`[HeartScoreTrace] calculateScore mutation error\n${traceJson(error)}`);
      toast.error("Failed to calculate HeartScore");
    },
  });

  // Fetch heart score history (last 30 days)
  const { data: history } = useQuery({
    queryKey: ["heartScore", "history", currentUserId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const queryKey = ["heartScore", "history", currentUserId];
      logTrace("[HeartScoreTrace] History query start", {
        queryKey,
        currentUserId,
        fromDate: thirtyDaysAgo.toISOString().split("T")[0],
      });

      const { data, error } = await supabase
        .from("heart_scores")
        .select("*")
        .eq("user_id", currentUserId!)
        .gte("score_date", thirtyDaysAgo.toISOString().split("T")[0])
        .order("score_date", { ascending: false });

      logTrace("[HeartScoreTrace] History query response", {
        queryKey,
        count: data?.length ?? 0,
        historyRows: data,
        error,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  return {
    todayScore,
    history,
    isLoading,
    calculateScore: calculateScore.mutate,
    isCalculating: calculateScore.isPending,
  };
};
