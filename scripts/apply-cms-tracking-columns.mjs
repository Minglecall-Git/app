/**
 * Add GA4 / GSC columns to public.cms_site_branding.
 * Uses Supabase Management API (SUPABASE_ACCESS_TOKEN or .cursor/mcp.json Bearer).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local') });

const SQL = `
ALTER TABLE public.cms_site_branding
  ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT;
ALTER TABLE public.cms_site_branding
  ADD COLUMN IF NOT EXISTS gsc_verification_content TEXT;
ALTER TABLE public.cms_site_branding
  ADD COLUMN IF NOT EXISTS header_scripts TEXT;
ALTER TABLE public.cms_site_branding
  ADD COLUMN IF NOT EXISTS footer_scripts TEXT;
ALTER TABLE public.cms_site_branding
  ADD COLUMN IF NOT EXISTS sitemap_updated_at TIMESTAMPTZ;
ALTER TABLE public.cms_site_branding
  ADD COLUMN IF NOT EXISTS sitemap_extra_paths TEXT;
NOTIFY pgrst, 'reload schema';
`;

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
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : '';
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
    console.error(
      'Missing SUPABASE_ACCESS_TOKEN (or MCP Authorization) / project ref.\n' +
        'Alternatively run this SQL in the Supabase SQL editor:\n' +
        SQL
    );
    process.exit(1);
  }

  const apply = await runQuery(token, ref, SQL);
  if (!apply.ok) {
    console.error('DDL apply failed', apply.status, apply.text.slice(0, 800));
    process.exit(1);
  }
  console.log('cms_site_branding GA4/GSC columns applied OK');

  const check = await runQuery(
    token,
    ref,
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cms_site_branding'
      AND column_name IN (
        'ga4_measurement_id',
        'gsc_verification_content',
        'header_scripts',
        'footer_scripts',
        'sitemap_updated_at',
        'sitemap_extra_paths'
      )
    ORDER BY column_name;
  `
  );
  console.log('verify', check.status, check.text.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
