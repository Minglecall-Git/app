/**
 * Ensure profiles.gallery_videos exists so video gallery survives refresh.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SQL = `
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gallery_videos JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.system_configs
  ADD COLUMN IF NOT EXISTS r2_profile_video_quota_mb INTEGER DEFAULT 30;
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
  if (!token || !ref) {
    console.error('Missing MCP token or project ref');
    process.exit(1);
  }

  const apply = await runQuery(token, ref, SQL);
  if (!apply.ok) {
    console.error('DDL apply failed', apply.status, apply.text.slice(0, 800));
    process.exit(1);
  }
  console.log('gallery_videos + quota column applied OK');

  const check = await runQuery(
    token,
    ref,
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'gallery_videos';
  `
  );
  console.log('verify', check.status, check.text.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
