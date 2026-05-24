# Plan - Migrate Waitlist Operations to Production-Grade Server Action

This plan details the steps required to migrate the waitlist database and API logic into a production-grade React Server Action, ensuring credentials safety and removing redundant `/api/waitlist` client handlers.

---

## 📋 Execution Checklist

### 1. Environment Variable Safety Check
- [ ] Inspect the environment setup. Ensure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` are kept strictly private on the server side.
- [ ] Modify `lib/supabase/server.ts` to allow `process.env.SUPABASE_URL` to be checked first as a private server-side fallback:
  ```typescript
  export function createSupabaseServerClient() {
    return createServerClient<Database>(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      ...
    );
  }
  ```

### 2. Create the Server Action
- [ ] Create the new server action file at [app/actions/waitlist.ts](file:///c:/projects/health2/greenlitmd-main/app/actions/waitlist.ts) (note: `app/` is at the root level in this workspace).
- [ ] Implement `joinWaitlistAction(formData: FormData)` with `"use server"`:
  - Extract email: `formData.get("email")`
  - Extract optional practice name: `formData.get("practice_name")`
  - Check honeypot field: `formData.get("honey")`
  - Call `insertSignup(email, null, practice_name)`
  - Catch Postgres unique error code `'23505'` and return:
    `{ success: false, error: "You're already on the list!" }`
  - Call `getSignupPosition(email)` and trigger `sendConfirmationEmail` via Resend.
  - Return `{ success: true }`.

### 3. Create the Reusable UI Component
- [ ] Create a standalone component at [components/WaitlistForm.tsx](file:///c:/projects/health2/greenlitmd-main/components/WaitlistForm.tsx).
- [ ] Code it with standard React hook states to consume `joinWaitlistAction` via `FormData` cleanly.
- [ ] Build in twin styling options (`variant="hero"` or `variant="standalone"`) to slot perfectly into both pages.

### 4. Page Integrations & API Cleanup
- [ ] Update [app/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/page.tsx) to import `WaitlistForm` and replace the inline hero form.
- [ ] Update [app/waitlist/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/waitlist/page.tsx) to import `WaitlistForm` and use `variant="standalone"`.
- [ ] Delete the redundant API route folder [app/api/waitlist/route.ts](file:///c:/projects/health2/greenlitmd-main/app/api/waitlist/route.ts).

### 5. Verification & Lint Checks
- [ ] Run typescript/linter checks or boot development server to verify code compilation.
