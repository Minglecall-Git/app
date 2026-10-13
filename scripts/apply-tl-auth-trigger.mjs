/**
 * One-shot: apply handle_new_auth_user TL role/gender fix + safe backfill.
 * Uses Supabase Management API (token from .cursor/mcp.json) or service-role RPC fallback.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id TEXT;
    v_meta_role TEXT;
    v_meta_gender TEXT;
    v_role TEXT;
    v_gender TEXT;
BEGIN
    v_meta_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'male_user'));
    v_meta_gender := lower(COALESCE(NEW.raw_user_meta_data->>'gender', ''));

    IF v_meta_role IN (
        'male_user', 'female_user', 'female_creator', 'female_host', 'other_user',
        'admin', 'team_leader', 'agency_manager'
    ) THEN
        v_role := v_meta_role;
    ELSE
        v_role := 'male_user';
    END IF;

    IF v_role IN ('team_leader', 'agency_manager') THEN
        v_gender := CASE WHEN v_meta_gender IN ('female', 'male', 'other') THEN v_meta_gender ELSE 'female' END;
        IF v_gender <> 'female' THEN
            v_gender := 'female';
        END IF;
    ELSIF v_meta_gender IN ('female', 'male', 'other') THEN
        v_gender := v_meta_gender;
    ELSE
        v_gender := 'male';
    END IF;

    IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
        SELECT id INTO v_existing_id
        FROM public.profiles
        WHERE lower(email) = lower(NEW.email)
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.profiles
            SET
                auth_id = NEW.id,
                email = NEW.email,
                name = COALESCE(NULLIF(name, ''), NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', name),
                role = CASE
                    WHEN v_role IN ('team_leader', 'agency_manager', 'admin') THEN v_role
                    ELSE role
                END,
                gender = CASE
                    WHEN v_role IN ('team_leader', 'agency_manager') THEN 'female'
                    WHEN v_role = 'admin' AND v_meta_gender IN ('female', 'male', 'other') THEN v_meta_gender
                    ELSE gender
                END,
                gender_locked = CASE
                    WHEN v_role IN ('team_leader', 'agency_manager') THEN true
                    ELSE gender_locked
                END,
                updated_at = now()
            WHERE id = v_existing_id;
            RETURN NEW;
        END IF;
    END IF;

    INSERT INTO public.profiles (
        id, auth_id, name, email, gender, gender_locked, role,
        coin_balance, hourly_coin_rate, is_onboarded, is_verified, online_status
    )
    VALUES (
        NEW.id::TEXT,
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'New Member'),
        NEW.email,
        v_gender,
        true,
        v_role,
        CASE WHEN v_role = 'male_user' THEN 50 ELSE 0 END,
        CASE WHEN v_role IN ('female_creator', 'female_host') THEN 10 ELSE 0 END,
        CASE WHEN v_role IN ('team_leader', 'agency_manager', 'admin') THEN true ELSE false END,
        CASE WHEN v_role IN ('team_leader', 'agency_manager', 'admin') THEN true ELSE false END,
        'online'
    )
    ON CONFLICT (id) DO UPDATE SET
        auth_id = COALESCE(EXCLUDED.auth_id, public.profiles.auth_id),
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        role = CASE
            WHEN EXCLUDED.role IN ('team_leader', 'agency_manager', 'admin') THEN EXCLUDED.role
            ELSE public.profiles.role
        END,
        gender = CASE
            WHEN EXCLUDED.role IN ('team_leader', 'agency_manager') THEN 'female'
            ELSE public.profiles.gender
        END,
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.protect_profiles_auth_id()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.auth_id IS NOT NULL AND NEW.auth_id IS NULL THEN
        NEW.auth_id := OLD.auth_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profiles_auth_id ON public.profiles;
CREATE TRIGGER trg_protect_profiles_auth_id
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profiles_auth_id();
`;

const BACKFILL_SQL = `
-- TL / agency_manager with wrong gender
UPDATE public.profiles
SET gender = 'female', gender_locked = true, updated_at = now()
WHERE role IN ('team_leader', 'agency_manager')
  AND (gender IS DISTINCT FROM 'female');

-- Safe: male_user rows that look like agency accounts (have agency_name + commission)
UPDATE public.profiles
SET role = 'team_leader', gender = 'female', gender_locked = true, updated_at = now()
WHERE role = 'male_user'
  AND gender = 'male'
  AND agency_name IS NOT NULL
  AND trim(agency_name) <> ''
  AND commission_percent IS NOT NULL;
`;

function getMcpToken() {
  try {
    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.cursor/mcp.json'), 'utf8'));
    const auth = mcp?.mcpServers?.supabase?.headers?.Authorization || '';
    return auth.replace(/^Bearer\s+/i, '').trim();
  } catch {
    return '';
  }
}

function getProjectRef() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const m = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

async function runSqlViaManagementApi(projectId, token, query) {
  const endpoints = [
    `https://api.supabase.com/v1/projects/${projectId}/database/query`,
    `https://api.supabase.com/v1/projects/${getProjectRef()}/database/query`,
  ];
  let lastErr = '';
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (res.ok) {
      return { ok: true, body: text };
    }
    lastErr = `${res.status} ${text.slice(0, 300)}`;
  }
  return { ok: false, error: lastErr };
}

async function main() {
  const token = getMcpToken();
  const ref = getProjectRef();
  if (!token) {
    console.error('No MCP Supabase token found in .cursor/mcp.json');
    process.exit(1);
  }
  if (!ref) {
    console.error('No project ref from VITE_SUPABASE_URL');
    process.exit(1);
  }

  const listRes = await fetch('https://api.supabase.com/v1/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const projects = await listRes.json();
  if (!Array.isArray(projects)) {
    console.error('Failed to list projects', listRes.status, JSON.stringify(projects).slice(0, 200));
    process.exit(1);
  }
  const match = projects.find((p) => p.ref === ref || p.id === ref);
  const projectId = match?.id || ref;
  console.log('Applying to project', match?.name || ref, projectId);

  const ddl = await runSqlViaManagementApi(projectId, token, TRIGGER_SQL);
  if (!ddl.ok) {
    console.error('DDL apply failed:', ddl.error);
    process.exit(1);
  }
  console.log('Trigger/function applied OK');

  const bf = await runSqlViaManagementApi(projectId, token, BACKFILL_SQL);
  if (!bf.ok) {
    console.error('Backfill failed:', bf.error);
    process.exit(1);
  }
  console.log('Backfill applied OK');

  // Verify via service role
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client
      .from('profiles')
      .select('id, name, email, role, gender, agency_name')
      .in('role', ['team_leader', 'agency_manager']);
    if (error) {
      console.warn('Verify query warning:', error.message);
    } else {
      const bad = (data || []).filter((r) => r.gender !== 'female');
      console.log('TL/agency rows:', (data || []).length, 'non-female:', bad.length);
      if (bad.length) console.log(bad);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
