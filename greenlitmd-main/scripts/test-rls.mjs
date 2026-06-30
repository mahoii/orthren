/**
 * RLS regression test — run with: node scripts/test-rls.mjs (from project root)
 *
 * Uses the anon key (not service role) to simulate an unauthenticated client.
 * Add new tables to TABLES any time the schema changes or a new table is created.
 * A [LEAK] result means RLS is disabled or missing a restrictive policy for that table.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Parse .env.local without dotenv (not a prod dep)
const envPath = resolve(process.cwd(), '.env.local')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map((p, i) => (i === 0 ? p.trim() : l.slice(l.indexOf('=') + 1).trim())))
)

const url = envVars['NEXT_PUBLIC_SUPABASE_URL']
const anonKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY']

if (!url || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, anonKey)

// Add any new table here when it's created.
const TABLES = [
  'waitlist',
  'users',
  'pa_cases',
  'submissions',
  'profiles',
  'subscriptions',
  'payer_rules',
]

console.log('Testing RLS with anon key (unauthenticated)...\n')

let leaks = 0

for (const table of TABLES) {
  const { data, error } = await supabase.from(table).select('*').limit(5)

  if (error) {
    if (error.code === '42P01') {
      console.log(`  [SKIP]  ${table} — table does not exist`)
    } else {
      console.log(`  [OK]    ${table} — blocked: ${error.message}`)
    }
  } else {
    const rowCount = data?.length ?? 0
    if (rowCount > 0) {
      console.log(`  [LEAK]  ${table} — returned ${rowCount} row(s)! RLS is MISCONFIGURED`)
      leaks++
    } else {
      console.log(`  [OK]    ${table} — 0 rows (RLS blocking or table is empty)`)
    }
  }
}

console.log(`\n${leaks === 0 ? 'All tables passed.' : `${leaks} table(s) leaking data — fix RLS before deploying.`}`)
process.exit(leaks > 0 ? 1 : 0)
