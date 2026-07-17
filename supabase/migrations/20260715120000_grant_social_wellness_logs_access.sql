-- Allow authenticated clients to read and write their own social wellness logs.
-- RLS policies still restrict rows to auth.uid() = user_id.
GRANT SELECT, INSERT, UPDATE ON TABLE public.social_wellness_logs TO authenticated;

