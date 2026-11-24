-- =============================================================================
-- LOCAL DEVELOPMENT SEED ONLY — never run against production.
-- Applied by `supabase db reset`. Creates a demo admin, one event, 400
-- participants (including intentional duplicate names) and 10 prize categories.
-- Demo credentials: admin@doorprize.local / Admin123!  (change immediately)
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Demo administrator (local only)
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'admin@doorprize.local',
  extensions.crypt('Admin123!', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'admin@doorprize.local',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"admin@doorprize.local"}'::jsonb,
  'email', now(), now(), now()
)
on conflict (id) do nothing;

insert into public.admin_profiles (user_id, email, display_name, role)
values ('11111111-1111-4111-8111-111111111111', 'admin@doorprize.local', 'Event Administrator', 'admin')
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Demo event
-- -----------------------------------------------------------------------------
insert into public.events (id, name, description, event_date, status, settings)
values (
  '33333333-3333-4333-8333-333333333333',
  'Annual Gathering 2026',
  'Corporate annual gathering — live doorprize draw. Local demo data.',
  now() + interval '7 days',
  'ready',
  '{
    "no_repeat": true,
    "public_display_enabled": true,
    "theme": "dark",
    "primary_color": "#e6b75c",
    "logo_url": null,
    "sound_enabled": true,
    "animation_duration_ms": 2600,
    "reveal_delay_ms": 1200
  }'::jsonb
)
on conflict (id) do nothing;

insert into public.display_tokens (event_id, slug, active)
values (
  '33333333-3333-4333-8333-333333333333',
  'local-demo-display-5f3a9c2e7b1d4806ba47e91c2d6f8305',
  true
)
on conflict (event_id) do nothing;

-- -----------------------------------------------------------------------------
-- 400 participants. Small first/last name pools intentionally create
-- duplicate names with different Employee IDs (e.g. "John Doe").
-- -----------------------------------------------------------------------------
insert into public.participants (event_id, employee_id, employee_name, status)
select
  '33333333-3333-4333-8333-333333333333',
  'EMP' || lpad(i::text, 4, '0'),
  (array['John','Jane','Michael','Sarah','David','Emily','Wei Ling','Ahmad',
         'Priya','Daniel','Grace','Kevin','Nurul','Robert','Linda','Chen Wei'])[((i - 1) % 16) + 1]
    || ' ' ||
  (array['Doe','Smith','Tan','Lee','Chen','Patel','Kumar','Nguyen','Wong','Brown',
         'Wilson','Singh','Lopez','Garcia','Kim','Ibrahim','Thomas','Jackson'])[((i - 1) % 18) + 1],
  'active'
from generate_series(1, 400) i
on conflict (event_id, employee_id) do nothing;

-- -----------------------------------------------------------------------------
-- 10 prize categories — illustrative only, fully editable in the UI.
-- -----------------------------------------------------------------------------
insert into public.prizes (event_id, name, description, category, quantity, display_order, status)
values
  ('33333333-3333-4333-8333-333333333333', 'Consolation Prize',  'Missed the big one?',          'Consolation', 10, 1,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Shopping Voucher',   'Shopping voucher',             'Voucher',     10, 2,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Headphones',         'Noise-cancelling headphones',  'Electronics', 10, 3,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Electronic Appliance','Home appliance',              'Appliance',    5, 4,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Smartwatch',         'Smart watch',                  'Electronics',  5, 5,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Tablet',             'Latest tablet',                'Electronics',  3, 6,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Smartphone',         'Flagship smartphone',          'Electronics',  3, 7,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Laptop',             'Premium laptop',               'Electronics',  2, 8,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Special Prize',      'Special recognition award',    'Special',      1, 9,  'active'),
  ('33333333-3333-4333-8333-333333333333', 'Grand Prize',        'The prize of the night',       'Grand',        1, 10, 'active')
on conflict do nothing;

-- display_state is populated automatically by the migration triggers.
