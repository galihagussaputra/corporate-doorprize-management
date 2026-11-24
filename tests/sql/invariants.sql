-- Run against a seeded local database: supabase db shell < tests/sql/invariants.sql
-- Every block raises an exception when an invariant is violated.

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public'
      and indexname = 'draw_winners_no_repeat_active_idx'
  ) then
    raise exception 'ONCE invariant missing: draw_winners_no_repeat_active_idx not found';
  end if;
end $$;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from (
    select event_id, employee_id
    from public.draw_winners
    where status = 'active'
    group by event_id, employee_id
    having count(*) > 1
  ) duplicates;
  if v_bad > 0 then
    raise exception 'ONCE violated: % employee/event pairs have multiple active winners', v_bad;
  end if;
end $$;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from (
    select event_id from public.draw_sessions
    where status in ('drawing', 'revealing')
    group by event_id having count(*) > 1
  ) concurrent;
  if v_bad > 0 then
    raise exception 'Concurrent draw sessions detected for % event(s)', v_bad;
  end if;
end $$;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from public.display_state d
  cross join lateral jsonb_array_elements(d.winners) as w(value)
  where (w.value->>'revealOrder')::int > d.reveal_index;
  if v_bad > 0 then
    raise exception 'Display projection leaked % unannounced winner(s)', v_bad;
  end if;
end $$;

select 'database invariants OK' as result;
