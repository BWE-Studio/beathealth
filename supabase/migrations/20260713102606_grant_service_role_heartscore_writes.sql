-- calculate-heart-score runs with the service-role client after validating the
-- caller JWT. The function writes HeartScore rows and may insert alerts.
GRANT SELECT, INSERT, UPDATE ON TABLE public.heart_scores TO service_role;
GRANT SELECT, INSERT ON TABLE public.health_alerts TO service_role;
