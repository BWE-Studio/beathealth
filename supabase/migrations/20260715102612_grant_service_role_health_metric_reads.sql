grant select on table
  public.bp_logs,
  public.sugar_logs,
  public.behavior_logs,
  public.social_wellness_logs,
  public.environmental_logs,
  public.cognitive_assessments
to service_role;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'bp_logs',
    'sugar_logs',
    'behavior_logs',
    'social_wellness_logs',
    'environmental_logs',
    'cognitive_assessments'
  ]
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = target_table
        and c.relrowsecurity
    ) then
      raise exception 'RLS must remain enabled on public.%', target_table;
    end if;
  end loop;
end $$;
