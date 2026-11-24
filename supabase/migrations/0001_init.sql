-- =============================================================================
-- Corporate Doorprize Management — initial schema, RLS and draw RPCs
-- PostgreSQL 15+ / Supabase. Safe to apply to an empty database.
-- No destructive statements (DROP/TRUNCATE) are used.
-- =============================================================================

create schema if not exists public;

-- gen_random_uuid() is a PostgreSQL core function (13+) backed by a
-- cryptographic RNG. It is the ONLY randomness source used for winner choice.
-- The SQL random() function is never used in this schema.

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.write_audit(
  p_event_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_old jsonb default null,
  p_new jsonb default null,
  p_reason text default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs
    (event_id, administrator_id, action, entity_type, entity_id, old_value, new_value, reason)
  values
    (p_event_id, auth.uid(), p_action, p_entity_type, p_entity_id,
     p_old, p_new, nullif(btrim(p_reason), ''));
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.admin_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'admin' check (role in ('admin', 'viewer')),
  event_id     uuid, -- reserved for future per-event scoping
  created_at   timestamptz not null default now()
);

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  description text not null default '',
  event_date  timestamptz,
  status      text not null default 'draft'
              check (status in ('draft','ready','in_progress','completed','archived')),
  settings    jsonb not null default '{
    "no_repeat": true,
    "public_display_enabled": false,
    "theme": "dark",
    "primary_color": "#e6b75c",
    "logo_url": null,
    "sound_enabled": true,
    "animation_duration_ms": 2600,
    "reveal_delay_ms": 1200
  }'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.display_tokens (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null unique references public.events(id) on delete cascade,
  slug       text not null unique check (char_length(slug) between 20 and 200),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table public.participants (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  employee_id   text not null check (char_length(btrim(employee_id)) between 1 and 100),
  employee_name text not null check (char_length(btrim(employee_name)) between 1 and 200),
  status        text not null default 'active' check (status in ('active','inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint participants_event_employee_key unique (event_id, employee_id)
);
create index participants_event_name_idx on public.participants (event_id, employee_name);
create index participants_event_status_idx on public.participants (event_id, status);
create trigger participants_updated_at before update on public.participants
  for each row execute function public.set_updated_at();

create table public.roster_imports (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  import_method   text not null check (import_method in ('excel','paste','manual')),
  import_mode     text not null check (import_mode in ('replace','sync','manual')),
  filename        text,
  total_records   integer not null default 0,
  valid_records   integer not null default 0,
  invalid_records integer not null default 0,
  added_records   integer not null default 0,
  updated_records integer not null default 0,
  removed_records integer not null default 0,
  administrator_id uuid references auth.users(id) on delete set null,
  override_reason  text,
  details          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index roster_imports_event_created_idx on public.roster_imports (event_id, created_at desc);

create table public.prizes (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 200),
  description  text not null default '',
  image_url    text,
  category     text not null default 'General',
  quantity     integer not null check (quantity between 1 and 1000),
  display_order integer not null default 0,
  status       text not null default 'active' check (status in ('active','inactive')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index prizes_event_order_idx on public.prizes (event_id, display_order, created_at);
create trigger prizes_updated_at before update on public.prizes
  for each row execute function public.set_updated_at();

create table public.draw_sessions (
  id                     uuid primary key default gen_random_uuid(),
  event_id               uuid not null references public.events(id) on delete cascade,
  prize_id               uuid not null references public.prizes(id),
  drawing_mode           text not null
                         check (drawing_mode in ('wheel','roller','picker','lottery')),
  requested_winner_count integer not null check (requested_winner_count between 1 and 1000),
  status                 text not null default 'revealing'
                         check (status in ('drawing','revealing','completed','cancelled','voided')),
  reveal_index           integer not null default 0 check (reveal_index >= 0),
  administrator_id       uuid references auth.users(id) on delete set null,
  presentation           jsonb not null default '{}'::jsonb,
  started_at             timestamptz not null default now(),
  completed_at           timestamptz,
  cancellation_reason    text,
  voided_reason          text,
  paused_at              timestamptz,
  created_at             timestamptz not null default now()
);
create index draw_sessions_event_created_idx on public.draw_sessions (event_id, created_at desc);
-- Only one live session per event. Cancelled/voided sessions are history.
create unique index draw_sessions_one_active_idx
  on public.draw_sessions (event_id)
  where status in ('drawing','revealing');

create table public.draw_winners (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.draw_sessions(id) on delete restrict,
  participant_id uuid not null references public.participants(id) on delete restrict,
  event_id      uuid not null references public.events(id) on delete cascade,
  prize_id      uuid not null references public.prizes(id),
  employee_id   text not null,
  employee_name text not null,
  reveal_order  integer not null check (reveal_order between 1 and 1000),
  status        text not null default 'active' check (status in ('active','voided','withdrawn')),
  revealed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint draw_winners_session_order_key unique (session_id, reveal_order)
);
create index draw_winners_event_employee_idx
  on public.draw_winners (event_id, employee_id) where status = 'active';
create index draw_winners_session_order_idx on public.draw_winners (session_id, reveal_order);
create index draw_winners_prize_idx on public.draw_winners (prize_id, status);
-- Database-level no-repeat policy. A re-draw VOIDS the original rows (which
-- removes them from this partial index) instead of deleting them.
create unique index draw_winners_no_repeat_active_idx
  on public.draw_winners (event_id, employee_id)
  where status = 'active';

create table public.redraw_links (
  id                     uuid primary key default gen_random_uuid(),
  original_session_id    uuid not null references public.draw_sessions(id),
  replacement_session_id uuid unique references public.draw_sessions(id),
  reason                 text not null check (char_length(btrim(reason)) >= 5),
  eligibility_policy     text not null
                         check (eligibility_policy in ('keep_ineligible','restore_eligibility')),
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now()
);

-- Explicit eligibility corrections. ONCE is the default and permanent policy.
-- When a completed result is voided, an administrator MUST choose a policy.
-- 'keep_ineligible' writes a row here (DB-enforced exclusion);
-- 'restore_eligibility' writes no row and is fully audited with reason + admin.
-- Eligibility can therefore never be restored silently.
create table public.eligibility_exclusions (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  employee_id      text not null,
  source_session_id uuid references public.draw_sessions(id) on delete set null,
  reason           text not null check (char_length(btrim(reason)) >= 5),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint eligibility_exclusions_event_employee_key unique (event_id, employee_id)
);
create index eligibility_exclusions_event_idx on public.eligibility_exclusions (event_id);

create table public.audit_logs (
  id               bigint generated always as identity primary key,
  event_id         uuid references public.events(id) on delete set null,
  administrator_id uuid references auth.users(id) on delete set null,
  action           text not null,
  entity_type      text not null,
  entity_id        text,
  old_value        jsonb,
  new_value        jsonb,
  reason           text,
  created_at       timestamptz not null default now()
);
create index audit_logs_event_created_idx on public.audit_logs (event_id, created_at desc);

-- Sanitized public projection. This is the ONLY table exposed to anon.
create table public.display_state (
  event_id          uuid primary key references public.events(id) on delete cascade,
  public_enabled    boolean not null default false,
  slug              text not null,
  event_name        text not null,
  event_status      text not null,
  logo_url          text,
  primary_color     text not null default '#e6b75c',
  prize_id          uuid,
  prize_name        text,
  prize_image_url   text,
  session_id        uuid,
  session_status    text,
  reveal_index      integer not null default 0,
  winner_count      integer not null default 0,
  drawing_mode      text,
  presentation      jsonb not null default '{}'::jsonb,
  winners           jsonb not null default '[]'::jsonb,
  previous_winners  jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);
alter table public.display_state replica identity full;

-- SECURITY DEFINER avoids infinite recursion between admin_profiles RLS and
-- the policies that consult admin_profiles. Declared after the tables so a
-- fresh database can parse the SQL body immediately.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the current JWT belongs to an active administrator. Used by every RLS policy and RPC.';

-- -----------------------------------------------------------------------------
-- display_state projection (trigger maintained, server-authored)
-- -----------------------------------------------------------------------------
create or replace function public.refresh_display_state(p_event_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_event     public.events%rowtype;
  v_token     public.display_tokens%rowtype;
  v_session   public.draw_sessions%rowtype;
  v_prize     public.prizes%rowtype;
  v_winners   jsonb := '[]'::jsonb;
  v_previous  jsonb := '[]'::jsonb;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    delete from public.display_state where event_id = p_event_id;
    return;
  end if;

  select * into v_token
  from public.display_tokens
  where event_id = p_event_id and active = true
  order by created_at desc limit 1;

  select * into v_session
  from public.draw_sessions
  where event_id = p_event_id and status in ('drawing','revealing','completed')
  order by case status when 'revealing' then 0 when 'drawing' then 1 else 2 end,
           created_at desc
  limit 1;

  if v_session.id is not null then
    select * into v_prize from public.prizes where id = v_session.prize_id;

    -- Unannounced winners (reveal_order > reveal_index) are never projected.
    select coalesce(jsonb_agg(jsonb_build_object(
             'revealOrder', w.reveal_order,
             'employeeId', w.employee_id,
             'employeeName', w.employee_name,
             'revealedAt', w.revealed_at
           ) order by w.reveal_order), '[]'::jsonb)
    into v_winners
    from public.draw_winners w
    where w.session_id = v_session.id
      and w.status = 'active'
      and w.reveal_order <= v_session.reveal_index;

    select coalesce(jsonb_agg(jsonb_build_object(
             'prizeName', p.name,
             'employeeId', w.employee_id,
             'employeeName', w.employee_name,
             'revealOrder', w.reveal_order,
             'completedAt', s.completed_at
           ) order by s.completed_at, w.reveal_order), '[]'::jsonb)
    into v_previous
    from public.draw_winners w
    join public.draw_sessions s on s.id = w.session_id
    join public.prizes p on p.id = w.prize_id
    where w.event_id = p_event_id
      and w.status = 'active'
      and s.status = 'completed'
      and s.id <> v_session.id;
  else
    -- No active session: show all previously announced winners.
    select coalesce(jsonb_agg(jsonb_build_object(
             'prizeName', p.name,
             'employeeId', w.employee_id,
             'employeeName', w.employee_name,
             'revealOrder', w.reveal_order,
             'completedAt', s.completed_at
           ) order by s.completed_at, w.reveal_order), '[]'::jsonb)
    into v_previous
    from public.draw_winners w
    join public.draw_sessions s on s.id = w.session_id
    join public.prizes p on p.id = w.prize_id
    where w.event_id = p_event_id and w.status = 'active' and s.status = 'completed';
  end if;

  insert into public.display_state (
    event_id, public_enabled, slug, event_name, event_status, logo_url,
    primary_color, prize_id, prize_name, prize_image_url, session_id,
    session_status, reveal_index, winner_count, drawing_mode, presentation,
    winners, previous_winners, updated_at
  )
  values (
    p_event_id,
    coalesce((v_event.settings->>'public_display_enabled')::boolean, false),
    coalesce(v_token.slug, ''),
    v_event.name,
    v_event.status,
    nullif(v_event.settings->>'logo_url', ''),
    coalesce(nullif(v_event.settings->>'primary_color', ''), '#e6b75c'),
    v_prize.id,
    v_prize.name,
    v_prize.image_url,
    v_session.id,
    v_session.status,
    coalesce(v_session.reveal_index, 0),
    coalesce(v_session.requested_winner_count, 0),
    v_session.drawing_mode,
    coalesce(v_session.presentation, '{}'::jsonb)
      || jsonb_build_object(
           'paused', v_session.paused_at is not null,
           'phase', case
             when v_session.status = 'completed' then 'completed_batch'
             when v_session.status in ('drawing','revealing')
                  and v_session.reveal_index = 0 then 'intro'
             when v_session.status in ('drawing','revealing') then 'reveal'
             else 'waiting'
           end
         ),
    v_winners,
    v_previous,
    now()
  )
  on conflict (event_id) do update set
    public_enabled = excluded.public_enabled,
    slug = excluded.slug,
    event_name = excluded.event_name,
    event_status = excluded.event_status,
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    prize_id = excluded.prize_id,
    prize_name = excluded.prize_name,
    prize_image_url = excluded.prize_image_url,
    session_id = excluded.session_id,
    session_status = excluded.session_status,
    reveal_index = excluded.reveal_index,
    winner_count = excluded.winner_count,
    drawing_mode = excluded.drawing_mode,
    presentation = excluded.presentation,
    winners = excluded.winners,
    previous_winners = excluded.previous_winners,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.tg_refresh_display_state()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Use JSONB field access: events has `id`, the other watched tables have
  -- `event_id`, and a direct field reference fails to compile for the wrong
  -- table's row type.
  if tg_op = 'DELETE' then
    v_id := coalesce((to_jsonb(old)->>'event_id')::uuid, (to_jsonb(old)->>'id')::uuid);
    perform public.refresh_display_state(v_id);
    return old;
  end if;

  v_id := coalesce((to_jsonb(new)->>'event_id')::uuid, (to_jsonb(new)->>'id')::uuid);
  perform public.refresh_display_state(v_id);
  return new;
end;
$$;

create trigger events_display_sync after insert or update on public.events
  for each row execute function public.tg_refresh_display_state();
create trigger tokens_display_sync after insert or update on public.display_tokens
  for each row execute function public.tg_refresh_display_state();
create trigger prizes_display_sync after insert or update on public.prizes
  for each row execute function public.tg_refresh_display_state();
create trigger sessions_display_sync after insert or update on public.draw_sessions
  for each row execute function public.tg_refresh_display_state();
create trigger winners_display_sync after insert or update on public.draw_winners
  for each row execute function public.tg_refresh_display_state();

-- -----------------------------------------------------------------------------
-- Draw engine RPCs
-- -----------------------------------------------------------------------------
create or replace function public.start_draw(
  p_event_id       uuid,
  p_prize_id       uuid,
  p_winner_count   integer,
  p_mode           text,
  p_presentation   jsonb default '{}'::jsonb,
  p_replaces_session_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_event       public.events%rowtype;
  v_prize       public.prizes%rowtype;
  v_selected    uuid[];
  v_session_id  uuid;
  v_active      boolean;
  v_eligible    integer;
  v_awarded     integer;
  v_result      jsonb;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: administrator role required' using errcode = '42501';
  end if;
  if p_winner_count is null or p_winner_count < 1 then
    raise exception 'Winner count must be at least 1' using errcode = '22023';
  end if;
  if p_mode not in ('wheel','roller','picker','lottery') then
    raise exception 'Unknown drawing mode' using errcode = '22023';
  end if;

  -- Serialize all draw/roster operations for this event.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if v_event.status not in ('ready','in_progress') then
    raise exception 'Event must be Ready or In Progress to draw' using errcode = '23514';
  end if;

  select * into v_prize from public.prizes
  where id = p_prize_id and event_id = p_event_id and status = 'active';
  if not found then raise exception 'Active prize not found for this event' using errcode = 'P0002'; end if;

  select exists (
    select 1 from public.draw_sessions
    where event_id = p_event_id and status in ('drawing','revealing')
  ) into v_active;
  if v_active then
    raise exception 'A draw session is already active for this event'
      using errcode = '23P01';
  end if;

  select count(*) into v_awarded
  from public.draw_winners
  where prize_id = p_prize_id and status = 'active';
  if v_awarded + p_winner_count > v_prize.quantity then
    raise exception 'Requested winners exceed remaining quantity for %', v_prize.name
      using errcode = '23514';
  end if;

  -- Eligibility is computed from Employee ID, never from the displayed name.
  select count(*) into v_eligible
  from public.participants p
  where p.event_id = p_event_id
    and p.status = 'active'
    and not exists (
      select 1 from public.draw_winners w
      where w.event_id = p_event_id
        and w.employee_id = p.employee_id
        and w.status = 'active'
    )
    and not exists (
      select 1 from public.eligibility_exclusions e
      where e.event_id = p_event_id and e.employee_id = p.employee_id
    );
  if v_eligible < p_winner_count then
    raise exception 'Insufficient eligible participants: % available, % requested',
      v_eligible, p_winner_count using errcode = '23514';
  end if;

  -- Cryptographic shuffle: gen_random_uuid() is v4 from the OS CSPRNG.
  select array_agg(s.id order by s.rnd) into v_selected
  from (
    select p.id, gen_random_uuid() as rnd
    from public.participants p
    where p.event_id = p_event_id
      and p.status = 'active'
      and not exists (
        select 1 from public.draw_winners w
        where w.event_id = p_event_id
          and w.employee_id = p.employee_id
          and w.status = 'active'
      )
      and not exists (
        select 1 from public.eligibility_exclusions e
        where e.event_id = p_event_id and e.employee_id = p.employee_id
      )
    order by rnd
    limit p_winner_count
  ) s;

  insert into public.draw_sessions
    (event_id, prize_id, drawing_mode, requested_winner_count, status,
     reveal_index, administrator_id, presentation, started_at)
  values
    (p_event_id, p_prize_id, p_mode, p_winner_count, 'revealing',
     0, auth.uid(), coalesce(p_presentation, '{}'::jsonb), now())
  returning id into v_session_id;

  insert into public.draw_winners
    (session_id, participant_id, event_id, prize_id, employee_id,
     employee_name, reveal_order, status, created_at)
  select
    v_session_id, p.id, p.event_id, p_prize_id, p.employee_id,
    p.employee_name, s.ord::integer, 'active', now()
  from unnest(v_selected) with ordinality as s(id, ord)
  join public.participants p on p.id = s.id;

  if p_replaces_session_id is not null then
    update public.redraw_links
    set replacement_session_id = v_session_id
    where original_session_id = p_replaces_session_id
      and replacement_session_id is null;
  end if;

  perform public.write_audit(
    p_event_id, 'draw.started', 'draw_session', v_session_id::text,
    null,
    jsonb_build_object('prizeId', p_prize_id, 'winnerCount', p_winner_count,
                       'mode', p_mode, 'replaces', p_replaces_session_id),
    null
  );

  select jsonb_build_object(
    'sessionId', v_session_id,
    'eventId', p_event_id,
    'prizeId', p_prize_id,
    'prizeName', v_prize.name,
    'drawingMode', p_mode,
    'winnerCount', p_winner_count,
    'eligibleCount', v_eligible,
    'winners', coalesce(jsonb_agg(jsonb_build_object(
      'revealOrder', w.reveal_order,
      'participantId', w.participant_id,
      'employeeId', w.employee_id,
      'employeeName', w.employee_name
    ) order by w.reveal_order), '[]'::jsonb)
  ) into v_result
  from public.draw_winners w where w.session_id = v_session_id;

  return v_result;
end;
$$;

create or replace function public.reveal_next(p_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  s        public.draw_sessions%rowtype;
  w        public.draw_winners%rowtype;
  v_index  integer;
  v_event_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: administrator role required' using errcode = '42501';
  end if;
  select event_id into v_event_id from public.draw_sessions where id = p_session_id;
  if v_event_id is null then raise exception 'Draw session not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_event_id::text, 0));

  select * into s from public.draw_sessions where id = p_session_id for update;
  if not found then raise exception 'Draw session not found' using errcode = 'P0002'; end if;
  if s.status not in ('drawing','revealing') then
    raise exception 'Draw session is not active' using errcode = '23514';
  end if;
  if s.reveal_index >= s.requested_winner_count then
    raise exception 'All winners have already been revealed' using errcode = '23514';
  end if;

  v_index := s.reveal_index + 1;
  update public.draw_sessions set reveal_index = v_index where id = p_session_id;
  update public.draw_winners set revealed_at = now()
  where session_id = p_session_id and reveal_order = v_index;
  select * into w from public.draw_winners
  where session_id = p_session_id and reveal_order = v_index;

  perform public.write_audit(
    s.event_id, 'draw.winner_revealed', 'draw_winner', w.id::text,
    null,
    jsonb_build_object('revealOrder', v_index, 'employeeId', w.employee_id),
    null
  );

  return jsonb_build_object(
    'sessionId', p_session_id,
    'revealIndex', v_index,
    'winnerCount', s.requested_winner_count,
    'allRevealed', v_index >= s.requested_winner_count,
    'winner', jsonb_build_object(
      'revealOrder', w.reveal_order,
      'employeeId', w.employee_id,
      'employeeName', w.employee_name
    )
  );
end;
$$;

create or replace function public.complete_draw(p_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  s public.draw_sessions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: administrator role required' using errcode = '42501';
  end if;
  select * into s from public.draw_sessions where id = p_session_id for update;
  if not found then raise exception 'Draw session not found' using errcode = 'P0002'; end if;
  if s.status not in ('drawing','revealing') then
    raise exception 'Draw session is not active' using errcode = '23514';
  end if;
  -- Never allow a direct API call to skip announcements: all winners must be
  -- revealed before the batch can be finalized and projected publicly.
  if s.reveal_index < s.requested_winner_count then
    raise exception 'All winners must be revealed before completing the draw'
      using errcode = '23514';
  end if;

  update public.draw_winners set revealed_at = coalesce(revealed_at, now())
  where session_id = p_session_id and status = 'active';
  update public.draw_sessions
  set status = 'completed',
      reveal_index = requested_winner_count,
      completed_at = now()
  where id = p_session_id;

  perform public.write_audit(s.event_id, 'draw.completed', 'draw_session', p_session_id::text,
    jsonb_build_object('status', s.status), jsonb_build_object('status', 'completed'), null);

  return jsonb_build_object('sessionId', p_session_id, 'status', 'completed');
end;
$$;

-- Pause/resume of the automatic reveal cadence is an admin-only persisted
-- action. The projector never calls these functions.
create or replace function public.set_draw_pause(p_session_id uuid, p_paused boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  s public.draw_sessions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: administrator role required' using errcode = '42501';
  end if;
  select * into s from public.draw_sessions where id = p_session_id for update;
  if not found then raise exception 'Draw session not found' using errcode = 'P0002'; end if;
  if s.status not in ('drawing','revealing') then
    raise exception 'Draw session is not active' using errcode = '23514';
  end if;

  update public.draw_sessions
  set paused_at = case when p_paused then coalesce(paused_at, now()) else null end
  where id = p_session_id;

  perform public.write_audit(s.event_id,
    case when p_paused then 'draw.paused' else 'draw.resumed' end,
    'draw_session', p_session_id::text,
    jsonb_build_object('paused', s.paused_at is not null),
    jsonb_build_object('paused', p_paused), null);

  return jsonb_build_object('sessionId', p_session_id, 'paused', p_paused);
end;
$$;

create or replace function public.cancel_draw(p_session_id uuid, p_reason text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  s public.draw_sessions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: administrator role required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;
  select * into s from public.draw_sessions where id = p_session_id for update;
  if not found then raise exception 'Draw session not found' using errcode = 'P0002'; end if;
  if s.status not in ('drawing','revealing') then
    raise exception 'Draw session is not active' using errcode = '23514';
  end if;

  update public.draw_winners set status = 'voided'
  where session_id = p_session_id and status = 'active';
  update public.draw_sessions
  set status = 'cancelled', cancellation_reason = btrim(p_reason),
      completed_at = now()
  where id = p_session_id;

  perform public.write_audit(s.event_id, 'draw.cancelled', 'draw_session', p_session_id::text,
    jsonb_build_object('status', s.status),
    jsonb_build_object('status', 'cancelled'), btrim(p_reason));

  return jsonb_build_object('sessionId', p_session_id, 'status', 'cancelled');
end;
$$;

create or replace function public.void_draw(
  p_session_id uuid,
  p_reason text,
  p_eligibility_policy text default 'keep_ineligible'
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  s public.draw_sessions%rowtype;
  v_link_id uuid;
  v_excluded integer := 0;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: administrator role required' using errcode = '42501';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Void reason must be at least 5 characters' using errcode = '22023';
  end if;
  if coalesce(p_eligibility_policy, 'keep_ineligible')
     not in ('keep_ineligible','restore_eligibility') then
    raise exception 'Unknown eligibility policy' using errcode = '22023';
  end if;

  select * into s from public.draw_sessions where id = p_session_id for update;
  if not found then raise exception 'Draw session not found' using errcode = 'P0002'; end if;
  if s.status <> 'completed' then
    raise exception 'Only a completed session can be voided for re-draw' using errcode = '23514';
  end if;

  -- ONCE policy: by default the voided Employee IDs remain permanently
  -- ineligible. Restoring eligibility is an explicit, audited choice.
  if p_eligibility_policy = 'keep_ineligible' then
    insert into public.eligibility_exclusions
      (event_id, employee_id, source_session_id, reason, created_by)
    select distinct s.event_id, w.employee_id, s.id, v_reason, auth.uid()
    from public.draw_winners w
    where w.session_id = p_session_id and w.status = 'active'
    on conflict (event_id, employee_id) do nothing;
    get diagnostics v_excluded = row_count;
  end if;

  update public.draw_winners set status = 'voided'
  where session_id = p_session_id and status = 'active';
  update public.draw_sessions
  set status = 'voided', voided_reason = v_reason, completed_at = now()
  where id = p_session_id;

  insert into public.redraw_links
    (original_session_id, reason, eligibility_policy, created_by)
  values (p_session_id, v_reason,
          coalesce(p_eligibility_policy, 'keep_ineligible'), auth.uid())
  returning id into v_link_id;

  perform public.write_audit(s.event_id, 'draw.voided', 'draw_session', p_session_id::text,
    jsonb_build_object('status', 'completed'),
    jsonb_build_object('status', 'voided', 'reason', v_reason,
                       'eligibilityPolicy', coalesce(p_eligibility_policy, 'keep_ineligible'),
                       'excludedEmployees', v_excluded),
    v_reason);

  return jsonb_build_object('sessionId', p_session_id, 'linkId', v_link_id,
    'status', 'voided', 'eligibilityPolicy', coalesce(p_eligibility_policy, 'keep_ineligible'),
    'excludedEmployees', v_excluded);
end;
$$;

-- -----------------------------------------------------------------------------
-- Roster commit RPC (atomic replace / sync)
-- -----------------------------------------------------------------------------
create or replace function public.commit_roster(
  p_event_id        uuid,
  p_mode            text,
  p_rows            jsonb,
  p_filename        text default null,
  p_method          text default 'excel',
  p_override_reason text default null,
  p_total_records   integer default null,
  p_invalid_records integer default 0
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_has_draw       boolean;
  v_added          integer := 0;
  v_updated        integer := 0;
  v_unchanged      integer := 0;
  v_removed        integer := 0;
  v_valid          integer;
  v_dupes          integer;
  v_import_id      uuid;
  v_reason         text := nullif(btrim(coalesce(p_override_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: administrator role required' using errcode = '42501';
  end if;
  if p_mode not in ('replace','sync') then
    raise exception 'Unknown import mode' using errcode = '22023';
  end if;
  if p_method not in ('excel','paste','manual') then
    raise exception 'Unknown import method' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  select exists (
    select 1 from public.draw_sessions where event_id = p_event_id
  ) into v_has_draw;
  if v_has_draw and v_reason is null then
    raise exception 'Roster is locked: this event already has draw history. Provide an override reason.'
      using errcode = '23514';
  end if;

  drop table if exists pg_temp.tmp_roster_rows;
  drop table if exists pg_temp.tmp_roster_existing;
  create temp table tmp_roster_rows on commit drop as
  select
    btrim(regexp_replace(coalesce(x."employeeId", ''), '\s+', ' ', 'g')) as employee_id,
    btrim(regexp_replace(coalesce(x."employeeName", ''), '\s+', ' ', 'g')) as employee_name
  from jsonb_to_recordset(p_rows) as x("employeeId" text, "employeeName" text);

  if exists (select 1 from tmp_roster_rows where employee_id = '' or employee_name = '') then
    raise exception 'Every row requires a non-empty Employee ID and Employee Name'
      using errcode = '23514';
  end if;
  if exists (select 1 from tmp_roster_rows where char_length(employee_id) > 100
             or char_length(employee_name) > 200) then
    raise exception 'Employee ID or Name exceeds maximum length' using errcode = '22023';
  end if;

  select count(*) into v_valid from tmp_roster_rows;
  select count(*) into v_dupes from (
    select employee_id from tmp_roster_rows group by employee_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception 'Payload contains % duplicate Employee ID(s)', v_dupes using errcode = '23505';
  end if;

  create temp table tmp_roster_existing on commit drop as
  select id, employee_id, employee_name
  from public.participants where event_id = p_event_id;

  -- REMOVED: present in roster, absent from payload. Never delete a participant
  -- that a winner record references; deactivate instead.
  v_removed := (
    select count(*) from tmp_roster_existing e
    left join tmp_roster_rows r using (employee_id)
    where r.employee_id is null and exists (
      select 1 from public.participants p
      where p.id = e.id and p.status = 'active'
    )
  );

  update public.participants p
  set status = 'inactive', updated_at = now()
  where p.event_id = p_event_id
    and p.status = 'active'
    and not exists (select 1 from tmp_roster_rows r where r.employee_id = p.employee_id);

  -- UPDATED / UNCHANGED
  v_updated := (
    select count(*) from tmp_roster_existing e
    join tmp_roster_rows r using (employee_id)
    where e.employee_name <> r.employee_name
  );
  v_unchanged := (
    select count(*) from tmp_roster_existing e
    join tmp_roster_rows r using (employee_id)
    where e.employee_name = r.employee_name
  );

  update public.participants p
  set employee_name = r.employee_name, status = 'active', updated_at = now()
  from tmp_roster_rows r
  where p.event_id = p_event_id and p.employee_id = r.employee_id
    and p.employee_name <> r.employee_name;

  -- Reactivate a previously inactive employee who reappears in the payload.
  update public.participants p
  set status = 'active', updated_at = now()
  from tmp_roster_rows r
  where p.event_id = p_event_id and p.employee_id = r.employee_id
    and p.status = 'inactive';

  -- ADDED
  insert into public.participants (event_id, employee_id, employee_name, status)
  select p_event_id, r.employee_id, r.employee_name, 'active'
  from tmp_roster_rows r
  where not exists (select 1 from tmp_roster_existing e where e.employee_id = r.employee_id);
  get diagnostics v_added = row_count;

  -- Replace mode hard-deletes absent rows ONLY when no winner references them.
  if p_mode = 'replace' then
    delete from public.participants p
    where p.event_id = p_event_id
      and not exists (select 1 from tmp_roster_rows r where r.employee_id = p.employee_id)
      and not exists (select 1 from public.draw_winners w where w.participant_id = p.id);
  end if;

  insert into public.roster_imports
    (event_id, import_method, import_mode, filename, total_records, valid_records,
     invalid_records, added_records, updated_records, removed_records,
     administrator_id, override_reason, details)
  values
    (p_event_id, p_method, p_mode, p_filename,
     coalesce(p_total_records, v_valid), v_valid, coalesce(p_invalid_records, 0),
     v_added, v_updated, v_removed, auth.uid(), v_reason,
     jsonb_build_object('unchanged', v_unchanged))
  returning id into v_import_id;

  perform public.write_audit(
    p_event_id, 'roster.' || p_mode, 'roster_import', v_import_id::text,
    null,
    jsonb_build_object('added', v_added, 'updated', v_updated,
                       'removed', v_removed, 'unchanged', v_unchanged,
                       'total', v_valid),
    v_reason
  );

  return jsonb_build_object(
    'importId', v_import_id, 'added', v_added, 'updated', v_updated,
    'unchanged', v_unchanged, 'removed', v_removed, 'valid', v_valid
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.admin_profiles  enable row level security;
alter table public.events          enable row level security;
alter table public.display_tokens enable row level security;
alter table public.participants    enable row level security;
alter table public.roster_imports  enable row level security;
alter table public.prizes          enable row level security;
alter table public.draw_sessions   enable row level security;
alter table public.draw_winners    enable row level security;
alter table public.redraw_links    enable row level security;
alter table public.eligibility_exclusions enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.display_state   enable row level security;

-- Admin tables: all operations require is_admin().
do $$
declare t text;
begin
  foreach t in array array[
    'admin_profiles','events','display_tokens','participants','roster_imports',
    'prizes','draw_sessions','draw_winners','redraw_links','eligibility_exclusions'
  ] loop
    execute format('create policy admin_all_%1$s on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

create policy admin_read_display_state on public.display_state for select
  to authenticated using (public.is_admin());
-- Public display is deliberately restricted to a sanitized row, only when the
-- administrator has enabled public display for that event.
create policy public_read_display_state on public.display_state for select
  to anon using (public_enabled = true and slug <> '');

-- Append-only audit log: SELECT + INSERT, never UPDATE/DELETE.
revoke all on public.audit_logs from anon, authenticated;
grant select, insert on public.audit_logs to authenticated;
create policy admin_read_audit on public.audit_logs for select
  to authenticated using (public.is_admin());
create policy admin_insert_audit on public.audit_logs for insert
  to authenticated with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.display_state to anon;

-- Realtime: the projector subscribes only to this table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'display_state'
  ) then
    alter publication supabase_realtime add table public.display_state;
  end if;
end $$;

grant execute on function public.start_draw(uuid, uuid, integer, text, jsonb, uuid) to authenticated;
grant execute on function public.reveal_next(uuid) to authenticated;
grant execute on function public.complete_draw(uuid) to authenticated;
grant execute on function public.cancel_draw(uuid, text) to authenticated;
grant execute on function public.void_draw(uuid, text, text) to authenticated;
grant execute on function public.set_draw_pause(uuid, boolean) to authenticated;
grant execute on function public.commit_roster(uuid, text, jsonb, text, text, text, integer, integer) to authenticated;

-- Draw mutations must go through the audited, atomic RPCs above. Direct table
-- writes are revoked even for admins, so reveal order, ONCE and history cannot
-- be bypassed by a crafted request.
revoke insert, update, delete on public.draw_sessions, public.draw_winners,
  public.redraw_links, public.eligibility_exclusions from anon, authenticated;
grant select on public.draw_sessions, public.draw_winners,
  public.redraw_links, public.eligibility_exclusions to authenticated;
revoke all on public.display_state from anon, authenticated;
grant select on public.display_state to anon, authenticated;

comment on table public.display_state is
  'Sanitized projection for projector displays. Contains no roster, audit, or admin data.';
