/**
 * Create public.app_nav_items (including parent_id) and seed defaults.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function getMcpToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.cursor/mcp.json'), 'utf8'));
    return String(mcp?.mcpServers?.supabase?.headers?.Authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim();
  } catch {
    return '';
  }
}

function getProjectRef() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : '';
}

function schemaSql() {
  const file = fs.readFileSync(path.join(root, 'supabase_schema.sql'), 'utf8').replace(/\u0000/g, '');
  const lines = file.split(/\r?\n/);
  const table = lines.slice(817, 978).join('\n');
  const rls = lines.slice(1659, 1679).join('\n');
  return `
${table}

${rls}

GRANT ALL ON TABLE public.app_nav_items TO postgres, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
`;
}

async function runQuery(token, ref, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function main() {
  const token = getMcpToken();
  const ref = getProjectRef();
  if (!ref) {
    console.error('No project ref from VITE_SUPABASE_URL');
    process.exit(1);
  }
  if (!token) {
    console.error('No Supabase access token. Add Authorization Bearer in .cursor/mcp.json or set SUPABASE_ACCESS_TOKEN, then re-run.');
    process.exit(1);
  }

  const apply = await runQuery(token, ref, schemaSql());
  if (!apply.ok) {
    console.error('DDL apply failed', apply.status, apply.text.slice(0, 1200));
    process.exit(1);
  }
  console.log('app_nav_items applied OK');

  const check = await runQuery(
    token,
    ref,
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_nav_items'
    ORDER BY ordinal_position;
  `
  );
  console.log('columns', check.status, check.text.slice(0, 800));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
