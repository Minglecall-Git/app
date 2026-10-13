/**
 * Ensure public.call_logs.updated_at exists (required by /api/calls/sync upserts).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SQL = `
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
`;

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
    body: JSON.stringify({ query: SQL }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('DDL apply failed', res.status, text.slice(0, 800));
    process.exit(1);
  }
  console.log('call_logs.updated_at applied OK');

  const check = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'call_logs'
          AND column_name = 'updated_at';
      `,
    }),
  });
  console.log('verify', check.status, (await check.text()).slice(0, 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
