#!/bin/bash
# Blocks writes to secrets, env files, and Supabase migration files.
# Receives file path as $1 (passed from settings.json hook command).
TARGET_FILE="${1:-}"

if [[ -z "$TARGET_FILE" ]]; then
  exit 0
fi

if [[ "$TARGET_FILE" =~ \.env ]] || [[ "$TARGET_FILE" =~ /secrets/ ]]; then
  echo "BLOCKED: Write to environment/secrets file denied: $TARGET_FILE" >&2
  echo "To edit env vars, update Vercel project settings or your local .env.local file manually." >&2
  exit 2
fi

if [[ "$TARGET_FILE" =~ supabase/migrations/ ]] || [[ "$TARGET_FILE" =~ supabase_setup\.sql ]]; then
  echo "BLOCKED: Direct write to Supabase migration file denied: $TARGET_FILE" >&2
  echo "Use 'supabase migration new <name>' to create a migration, then edit it." >&2
  exit 2
fi

if [[ "$TARGET_FILE" =~ package-lock\.json ]]; then
  echo "BLOCKED: Direct write to package-lock.json denied: $TARGET_FILE" >&2
  echo "Use 'npm install' to update lockfile." >&2
  exit 2
fi

exit 0
