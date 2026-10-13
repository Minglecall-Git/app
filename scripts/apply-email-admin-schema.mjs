/**
 * Apply email policy columns + email_dispatch_log for Admin Email tab.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SQL = `
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_register_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_account_create_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_account_delete_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS allow_create_without_otp BOOLEAN DEFAULT false;
ALTER TABLE public.system_configs ADD COLUMN IF NOT EXISTS email_show_otp_fallback BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.email_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL DEFAULT 'other',
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_log_created ON public.email_dispatch_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_dispatch_log_recipient ON public.email_dispatch_log(recipient_email);
ALTER TABLE public.email_dispatch_log ENABLE ROW LEVEL SECURITY;
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
  console.log('Email admin schema applied OK');

  const check = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        select
          (select count(*) from information_schema.columns
             where table_schema='public' and table_name='system_configs'
               and column_name='allow_create_without_otp') as has_policy_col,
          (select to_regclass('public.email_dispatch_log') is not null) as has_log_table;
      `,
    }),
  });
  const body = await check.json();
  console.log('verify', Array.isArray(body) ? body[0] : body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
