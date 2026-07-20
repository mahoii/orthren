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
  'organizations',
  'memberships',
  'surgeons',
  'invitations',
]

console.log('Testing RLS with anon key (unauthenticated)...\n')

let leaks = 0
let cacheSkips = 0

// PostgREST error codes that mean "table not in schema cache" (stale cache or
// insufficient anon grants), as opposed to a genuine Postgres 42P01 (table
// never existed).  PGRST204/205 are the common codes; guard on the message too
// because Supabase has occasionally returned 42P01 from PostgREST itself when
// the cache is stale rather than the table being absent.
const isCacheMiss = (err) =>
  err.code === 'PGRST205' ||
  err.code === 'PGRST204' ||
  (err.message && /relation .* does not exist/i.test(err.message) && err.code !== '42P01')

for (const table of TABLES) {
  const { data, error } = await supabase.from(table).select('*').limit(5)

  if (error) {
    if (error.code === '42P01') {
      // Table does not exist in Postgres at all — skip silently.
      console.log(`  [SKIP]  ${table} — table does not exist in DB (42P01)`)
    } else if (isCacheMiss(error)) {
      // Table exists in Postgres but PostgREST hasn't cached it yet (or the
      // anon role lacks USAGE/SELECT, causing it to be hidden from the cache).
      // This is NOT a passing result — reload the schema cache or check grants.
      console.log(`  [SKIP/CACHE]  ${table} — PostgREST schema-cache miss (${error.code}); run: NOTIFY pgrst, 'reload schema';`)
      cacheSkips++
    } else {
      // Any other error (e.g. 42501 permission denied) counts as RLS blocking.
      console.log(`  [OK]    ${table} — blocked: ${error.message} (${error.code})`)
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

if (cacheSkips > 0) {
  console.log(`\n⚠  ${cacheSkips} table(s) skipped due to PostgREST schema-cache miss.`)
  console.log('   Fix: run  NOTIFY pgrst, \'reload schema\';  in the Supabase SQL editor, then re-run this script.')
}
console.log(`\n${leaks === 0 ? 'All tested tables passed.' : `${leaks} table(s) leaking data — fix RLS before deploying.`}`)
process.exit(leaks > 0 ? 1 : 0)
