# Plan - Upstash Redis Package Swap

This plan outlines replacing `@vercel/kv` with `@upstash/redis` directly in `app/api/feedback/route.ts` to keep the dependency footprint lightweight.

---

## 📋 Execution Checklist

### 1. Uninstall and Synchronize Dependencies
- [x] Run `npm uninstall @vercel/kv` in the root of the workspace.
- [x] Run `npm install @upstash/redis` in the root of the workspace to ensure the package and its latest types are correctly installed and synchronized in `package-lock.json`.

### 2. Update Feedback API Route File
- [x] Open [app/api/feedback/route.ts](file:///c:/projects/health2/greenlitmd-main/app/api/feedback/route.ts).
- [x] Replace:
  ```typescript
  import { kv } from "@vercel/kv";
  ```
  With:
  ```typescript
  import { Redis } from "@upstash/redis";

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  ```
- [x] Replace:
  ```typescript
  await kv.lpush("pa_outcomes", JSON.stringify(record));
  ```
  With:
  ```typescript
  await redis.lpush("pa_outcomes", JSON.stringify(record));
  ```

### 3. Verify Build and Type Safety
- [x] Run `npx tsc --noEmit` from the root directory to confirm the build succeeds with zero compiler/TypeScript errors.
