import fs from 'fs';
import path from 'path';

const CANONICAL_SCHEMA_FILENAME = 'supabase_schema.sql';

/**
 * Absolute path to the single canonical schema file at the project root.
 */
export function getCanonicalSchemaPath(): string {
  return path.join(process.cwd(), CANONICAL_SCHEMA_FILENAME);
}

/**
 * Read the canonical master schema SQL from disk (Node/backend only).
 */
export function readCanonicalSchemaSql(): string {
  const schemaPath = getCanonicalSchemaPath();
  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `Canonical schema file not found at ${schemaPath}. Expected /supabase_schema.sql at project root.`
    );
  }
  return fs.readFileSync(schemaPath, 'utf8');
}

/**
 * Count CREATE TABLE statements for admin UI metadata.
 */
export function countSchemaTables(sql: string): number {
  const matches = sql.match(/CREATE TABLE IF NOT EXISTS public\.\w+/gi);
  return matches ? matches.length : 0;
}

/**
 * Build a safe incremental migration script from the canonical schema.
 * The master schema is already idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS);
 * this wrapper labels it for existing databases and keeps a single source of truth.
 */
export function buildMigrationSchemaSql(masterSql?: string): string {
  const sql = masterSql ?? readCanonicalSchemaSql();
  return `-- ============================================================================
-- LIVECALL DATING & MONETIZATION ECOSYSTEM - SAFE INCREMENTAL MIGRATION
-- Derived from canonical /supabase_schema.sql (single source of truth)
-- Fully idempotent: safe to re-run on existing Supabase databases.
-- Paste into Supabase SQL Editor and click "Run".
-- ============================================================================

${sql}
`;
}

/**
 * Load master + migration payloads for /api/admin/schema.
 */
export function loadAdminSchemaPayload(): {
  success: true;
  sql: string;
  migrationSql: string;
  tablesCount: number;
  version: string;
  source: string;
  generatedAt: string;
} {
  const sql = readCanonicalSchemaSql();
  return {
    success: true,
    sql,
    migrationSql: buildMigrationSchemaSql(sql),
    tablesCount: countSchemaTables(sql),
    version: '3.2',
    source: CANONICAL_SCHEMA_FILENAME,
    generatedAt: new Date().toISOString(),
  };
}
