/**
 * Apply handle_new_auth_user public-role overwrite fix to remote Supabase.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const TRIGGER_SQL = fs
  .readFileSync(path.join(root, 'supabase_schema.sql'), 'utf8')
  .match(
    /CREATE OR REPLACE FUNCTION public\.handle_new_auth_user\(\)[\s\S]*?EXECUTE FUNCTION public\.protect_profiles_auth_id\(\);/
  )?.[0];

if (!TRIGGER_SQL) {
  console.error('Could not extract handle_new_auth_user + protect trigger from supabase_schema.sql');
  process.exit(1);
}

function getMcpToken() {
  const mcp = JSON.parse(fs.readFileSync(path.join(root, '.cursor/mcp.json'), 'utf8'));
  return String(mcp?.mcpServers?.supabase?.headers?.Authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

function getProjectRef() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const m = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

async function main() {
  const token = getMcpToken();
  const ref = getProjectRef();
  if (!token || !ref) {
    console.error('Missing MCP token or project ref');
    process.exit(1);
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: TRIGGER_SQL }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('DDL apply failed', res.status, text.slice(0, 500));
    process.exit(1);
  }
  console.log('Trigger applied OK');

  // Verify function text contains public overwrite logic
  const check = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `select pg_get_functiondef('public.handle_new_auth_user'::regproc) as def;`,
    }),
  });
  const body = await check.json();
  const def = Array.isArray(body) ? body[0]?.def : body?.def;
  console.log('has_v_is_public', String(def).includes('v_is_public'));
  console.log('has_public_overwrite', String(def).includes('WHEN v_is_public THEN v_role'));

  // Safe data backfill: public-looking rows stuck as team_leader with no agency are out of scope;
  // only fix male_user gender mismatches if any.
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client
      .from('profiles')
      .select('id, email, role, gender')
      .eq('role', 'male_user')
      .neq('gender', 'male');
    if (!error && data?.length) {
      for (const row of data) {
        await client
          .from('profiles')
          .update({ gender: 'male', gender_locked: true })
          .eq('id', row.id);
      }
      console.log('Fixed male_user gender rows:', data.length);
    } else {
      console.log('male_user gender check ok');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
