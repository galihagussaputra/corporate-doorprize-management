-- End-to-end SQL invariant check for the draw engine.
-- Run after `npm run db:reset` (seed supplies the demo admin user):
--   supabase db shell < tests/sql/draw_flow.sql
-- It creates an isolated test event, exercises start/reveal/complete/void/re-draw,
-- and raises an exception if any business rule is violated.

do $$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_event uuid := 'a1000000-0000-4000-8000-000000000001';
  v_prize uuid := 'a2000000-0000-4000-8000-000000000002';
  v_prize2 uuid := 'a3000000-0000-4000-8000-000000000003';
  v_session uuid;
  v_result jsonb;
  v_count int;
begin
  -- Supabase auth.uid() reads the JWT subject claim from this GUC.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  insert into public.events(id, name, status, settings)
  values (v_event, 'SQL Flow Check', 'ready',
    '{"no_repeat":true,"public_display_enabled":true,"primary_color":"#e6b75c"}'::jsonb);
  insert into public.display_tokens(event_id, slug, active)
  values (v_event, 'sql-flow-check-display-1234567890abcdef', true);
  insert into public.participants(event_id, employee_id, employee_name)
  select v_event, 'SQL-' || i, 'SQL Person ' || i from generate_series(1, 4) i;
  insert into public.prizes(id, event_id, name, quantity, display_order)
  values (v_prize, v_event, 'Flow Prize A', 2, 0), (v_prize2, v_event, 'Flow Prize B', 4, 1);

  v_result := public.start_draw(v_event, v_prize, 2, 'wheel', '{}'::jsonb);
  v_session := (v_result->>'sessionId')::uuid;
  if jsonb_array_length(v_result->'winners') <> 2 then
    raise exception 'Expected two persisted winners';
  end if;

  select count(*) into v_count
  from public.display_state
  where event_id = v_event and jsonb_array_length(winners) <> 0;
  if v_count <> 0 then
    raise exception 'Unannounced winner leaked to the public projection';
  end if;

  perform public.reveal_next(v_session);
  perform public.reveal_next(v_session);
  select count(*) into v_count
  from public.display_state
  where event_id = v_event and jsonb_array_length(winners) = 2 and reveal_index = 2;
  if v_count <> 1 then
    raise exception 'Display projection did not catch up after reveals';
  end if;

  perform public.complete_draw(v_session);

  -- ONCE: four seats remain on Prize B, but only two eligible people remain.
  begin
    perform public.start_draw(v_event, v_prize2, 4, 'roller', '{}'::jsonb);
    raise exception 'ONCE did not block a second prize for previous winners';
  exception when others then
    if sqlerrm not like 'Insufficient eligible%' then raise; end if;
  end;

  perform public.void_draw(v_session, 'SQL flow check void', 'keep_ineligible');
  select count(*) into v_count from public.eligibility_exclusions where event_id = v_event;
  if v_count <> 2 then
    raise exception 'Void did not preserve both Employee IDs as ineligible';
  end if;
  select count(*) into v_count
  from public.draw_winners where session_id = v_session and status = 'voided';
  if v_count <> 2 then
    raise exception 'Voided winner history was not preserved';
  end if;

  v_result := public.start_draw(v_event, v_prize2, 2, 'picker', '{}'::jsonb);
  if jsonb_array_length(v_result->'winners') <> 2 then
    raise exception 'Fresh re-draw after void failed';
  end if;
end $$;

select 'draw flow OK' as result;
