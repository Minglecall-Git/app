import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const mcp = JSON.parse(fs.readFileSync('.cursor/mcp.json', 'utf8'));
const token = mcp.mcpServers.supabase.headers.Authorization.replace(/^Bearer\s+/i, '');
const ref = (process.env.VITE_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)[1];

const q = `select pg_get_functiondef('public.handle_new_auth_user'::regproc) as def;`;
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: q }),
});
const body = await res.json();
const def = Array.isArray(body) ? body[0]?.def : body?.def;
console.log('status', res.status);
console.log('has_team_leader', String(def).includes('team_leader'));
console.log('has_agency_manager', String(def).includes('agency_manager'));

const client = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: tls } = await client
  .from('profiles')
  .select('id,name,role,gender,agency_name')
  .in('role', ['team_leader', 'agency_manager']);
console.log('tl_rows', tls);

const { data: suspicious } = await client
  .from('profiles')
  .select('id,name,role,gender,agency_name,commission_percent')
  .eq('role', 'male_user')
  .not('agency_name', 'is', null);
console.log('male_with_agency', suspicious);
