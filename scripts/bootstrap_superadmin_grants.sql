-- One-time bootstrap for new empty Supabase project:
-- 1) Grant API roles access to public tables (fixes "permission denied for table profiles")
-- 2) Ensure superadmin@minglecall.com is an admin profile linked to Auth
--
-- Auth user already created:
--   email: superadmin@minglecall.com
--   auth id: c2991af3-a7ef-43bd-9782-8216f9c6b92b
--
-- Run this entire script in Supabase Dashboard → SQL Editor → Run

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- Keep password_hash column locked from client roles (matches supabase_schema.sql)
REVOKE SELECT (password_hash) ON public.profiles FROM anon, authenticated;

UPDATE public.profiles
SET
  role = 'admin',
  name = 'Super Admin',
  is_verified = true,
  is_onboarded = true,
  gender = 'male',
  gender_locked = true,
  auth_id = 'c2991af3-a7ef-43bd-9782-8216f9c6b92b'::uuid,
  updated_at = now()
WHERE lower(email) = 'superadmin@minglecall.com'
   OR id = 'c2991af3-a7ef-43bd-9782-8216f9c6b92b'
   OR auth_id = 'c2991af3-a7ef-43bd-9782-8216f9c6b92b'::uuid;

INSERT INTO public.profiles (
  id, auth_id, name, email, gender, gender_locked, role,
  coin_balance, is_onboarded, is_verified, online_status
)
SELECT
  'c2991af3-a7ef-43bd-9782-8216f9c6b92b',
  'c2991af3-a7ef-43bd-9782-8216f9c6b92b'::uuid,
  'Super Admin',
  'superadmin@minglecall.com',
  'male',
  true,
  'admin',
  0,
  true,
  true,
  'online'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE lower(email) = 'superadmin@minglecall.com'
     OR id = 'c2991af3-a7ef-43bd-9782-8216f9c6b92b'
);

SELECT id, auth_id, email, role, is_onboarded, is_verified
FROM public.profiles
WHERE lower(email) = 'superadmin@minglecall.com';
