-- Repair live schema drift between the deployed database and the current app.
-- This migration is intentionally additive/idempotent: it preserves existing
-- columns and data while adding the columns, grants, and policies the app uses.

-- Profile ritual preferences used by medication reminders and onboarding.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS morning_ritual_time TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS evening_ritual_time TIME DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS has_diabetes BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_hypertension BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_heart_disease BOOLEAN DEFAULT false;

-- BP logs: current app/edge functions use measured_at, heart_rate, ritual_type.
ALTER TABLE public.bp_logs
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heart_rate INTEGER,
  ADD COLUMN IF NOT EXISTS ritual_type TEXT;

UPDATE public.bp_logs
SET measured_at = COALESCE(measured_at, created_at, now())
WHERE measured_at IS NULL;

UPDATE public.bp_logs
SET heart_rate = COALESCE(heart_rate, pulse)
WHERE heart_rate IS NULL AND pulse IS NOT NULL;

ALTER TABLE public.bp_logs
  ALTER COLUMN measured_at SET DEFAULT now();

-- Sugar logs: current app/edge functions use glucose_mg_dl, measurement_type,
-- measured_at, and ritual_type.
ALTER TABLE public.sugar_logs
  ADD COLUMN IF NOT EXISTS glucose_mg_dl INTEGER,
  ADD COLUMN IF NOT EXISTS measurement_type TEXT,
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ritual_type TEXT;

UPDATE public.sugar_logs
SET glucose_mg_dl = COALESCE(glucose_mg_dl, blood_sugar)
WHERE glucose_mg_dl IS NULL AND blood_sugar IS NOT NULL;

UPDATE public.sugar_logs
SET measurement_type = COALESCE(measurement_type, meal_type)
WHERE measurement_type IS NULL AND meal_type IS NOT NULL;

UPDATE public.sugar_logs
SET measured_at = COALESCE(measured_at, created_at, now())
WHERE measured_at IS NULL;

ALTER TABLE public.sugar_logs
  ALTER COLUMN measured_at SET DEFAULT now();

-- Behavior logs used by Dashboard ritual progress and check-ins.
ALTER TABLE public.behavior_logs
  ADD COLUMN IF NOT EXISTS log_date DATE,
  ADD COLUMN IF NOT EXISTS ritual_type TEXT,
  ADD COLUMN IF NOT EXISTS sleep_quality TEXT,
  ADD COLUMN IF NOT EXISTS meds_taken BOOLEAN,
  ADD COLUMN IF NOT EXISTS steps_count INTEGER,
  ADD COLUMN IF NOT EXISTS left_home BOOLEAN,
  ADD COLUMN IF NOT EXISTS talked_to_family BOOLEAN;

UPDATE public.behavior_logs
SET log_date = COALESCE(log_date, created_at::date, CURRENT_DATE)
WHERE log_date IS NULL;

-- HeartScore fields used by frontend and calculate-heart-score edge function.
ALTER TABLE public.heart_scores
  ADD COLUMN IF NOT EXISTS score_date DATE,
  ADD COLUMN IF NOT EXISTS heart_score NUMERIC,
  ADD COLUMN IF NOT EXISTS bp_score NUMERIC,
  ADD COLUMN IF NOT EXISTS sugar_score NUMERIC,
  ADD COLUMN IF NOT EXISTS consistency_score NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_explanation TEXT;

UPDATE public.heart_scores
SET score_date = COALESCE(score_date, created_at::date, CURRENT_DATE)
WHERE score_date IS NULL;

UPDATE public.heart_scores
SET heart_score = COALESCE(heart_score, score)
WHERE heart_score IS NULL AND score IS NOT NULL;

ALTER TABLE public.heart_scores
  ALTER COLUMN score_date SET DEFAULT CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS heart_scores_user_score_date_key
  ON public.heart_scores(user_id, score_date);

-- Medication compatibility: the live DB has medication_name, while the app uses
-- name/active/notes/custom_times/updated_at. Keep both names and backfill.
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS custom_times TIME[],
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.medications
SET name = COALESCE(name, medication_name)
WHERE name IS NULL AND medication_name IS NOT NULL;

UPDATE public.medications
SET medication_name = COALESCE(medication_name, name)
WHERE medication_name IS NULL AND name IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.medication_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  skipped BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;

-- Data API grants: RLS still controls rows, but PostgREST also needs table
-- privileges for authenticated clients.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.family_links,
  public.subscriptions,
  public.notification_preferences,
  public.streaks,
  public.health_alerts,
  public.appointments,
  public.referrals,
  public.user_memory,
  public.user_model,
  public.agent_preferences,
  public.lab_results,
  public.lab_reminders,
  public.interaction_outcomes,
  public.heart_scores,
  public.bp_logs,
  public.sugar_logs,
  public.medications,
  public.medication_logs,
  public.behavior_logs,
  public.health_goals
TO authenticated;

-- The profile/BP/sugar/heart/streak caregiver policies reference family_links.
-- Authenticated users need SELECT privilege and a SELECT policy on family_links
-- so those RLS subqueries can evaluate without exposing unrelated rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'family_links'
      AND policyname = 'Members and caregivers can view family links'
  ) THEN
    CREATE POLICY "Members and caregivers can view family links"
      ON public.family_links FOR SELECT
      USING (auth.uid() = member_id OR auth.uid() = caregiver_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'family_links'
      AND policyname = 'Caregivers can create family links'
  ) THEN
    CREATE POLICY "Caregivers can create family links"
      ON public.family_links FOR INSERT
      WITH CHECK (auth.uid() = caregiver_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medication_logs'
      AND policyname = 'Users can view their own medication logs'
  ) THEN
    CREATE POLICY "Users can view their own medication logs"
      ON public.medication_logs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medication_logs'
      AND policyname = 'Users can insert their own medication logs'
  ) THEN
    CREATE POLICY "Users can insert their own medication logs"
      ON public.medication_logs FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medication_logs'
      AND policyname = 'Users can update their own medication logs'
  ) THEN
    CREATE POLICY "Users can update their own medication logs"
      ON public.medication_logs FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medication_logs'
      AND policyname = 'Users can delete their own medication logs'
  ) THEN
    CREATE POLICY "Users can delete their own medication logs"
      ON public.medication_logs FOR DELETE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medications'
      AND policyname = 'Users can view their own medications'
  ) THEN
    CREATE POLICY "Users can view their own medications"
      ON public.medications FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medications'
      AND policyname = 'Users can insert their own medications'
  ) THEN
    CREATE POLICY "Users can insert their own medications"
      ON public.medications FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medications'
      AND policyname = 'Users can update their own medications'
  ) THEN
    CREATE POLICY "Users can update their own medications"
      ON public.medications FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medications'
      AND policyname = 'Users can delete their own medications'
  ) THEN
    CREATE POLICY "Users can delete their own medications"
      ON public.medications FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bp_logs_user_measured_at
  ON public.bp_logs(user_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_sugar_logs_user_measured_at
  ON public.sugar_logs(user_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_behavior_logs_user_date
  ON public.behavior_logs(user_id, log_date);

CREATE INDEX IF NOT EXISTS idx_medication_logs_user_scheduled_at
  ON public.medication_logs(user_id, scheduled_at DESC);
