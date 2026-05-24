# Plan - Fix Waitlist Form Production Origin Issues & Optimize Client/Server Boundary

This plan outlines the steps to:
1. Fix CSRF check failures in production by adding `allowedOrigins` to the Next.js configuration.
2. Refactor `app/page.tsx` into a Server Component by extracting the client-side scrolling logic into a thin client component `components/ScrollButton.tsx`.
3. Update CTAs on the landing page to use the new `ScrollButton` or standard Next.js `<Link>` components, avoiding unnecessary client rendering.

---

## 📋 Execution Checklist

### 1. Update Next.js Configuration (`next.config.mjs`)
- [ ] Add the experimental serverActions configuration with `allowedOrigins` to allow Next.js to skip the CSRF check on production Vercel domains.
  ```javascript
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    experimental: {
      serverActions: {
        allowedOrigins: [
          "greenlitmd.app",
          "www.greenlitmd.app",
          "*.vercel.app",
        ],
      },
    },
  };

  export default nextConfig;
  ```

### 2. Create the Thin Client Component `components/ScrollButton.tsx`
- [ ] Create the file [components/ScrollButton.tsx](file:///c:/projects/health2/greenlitmd-main/components/ScrollButton.tsx) with `"use client"`.
- [ ] Implement a reusable button that scrolls to the waitlist form smoothly:
  ```tsx
  "use client";

  interface ScrollButtonProps {
    className?: string;
    children?: React.ReactNode;
  }

  export default function ScrollButton({ className, children }: ScrollButtonProps) {
    return (
      <button
        onClick={() =>
          document.getElementById("waitlist-form")?.scrollIntoView({ behavior: "smooth" })
        }
        className={className}
      >
        {children || "Request Early Access →"}
      </button>
    );
  }
  ```

### 3. Convert `app/page.tsx` to a Server Component
- [ ] Open [app/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/page.tsx).
- [ ] Remove the `"use client";` directive from the very first line.
- [ ] Import `ScrollButton` from `@/components/ScrollButton`.
- [ ] Remove the `scrollToWaitlist` helper function inside `LandingPage()`.
- [ ] Update the three waitlist trigger buttons:
  - **Section 5 (How it works) Button (Lines 287-293)**:
    Replace:
    ```tsx
    <button
      onClick={scrollToWaitlist}
      className="rounded-lg border border-white/30 bg-white/10 px-8 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 hover:border-white/50"
    >
      Request Early Access →
    </button>
    ```
    With:
    ```tsx
    <ScrollButton className="rounded-lg border border-white/30 bg-white/10 px-8 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 hover:border-white/50" />
    ```
  - **Solo Practice Pricing CTA (Lines 334-340)**:
    Replace:
    ```tsx
    <button
      onClick={scrollToWaitlist}
      id="pricing-solo-cta"
      className="mt-8 w-full rounded-lg border-2 border-clinical-navy px-4 py-2.5 text-sm font-semibold text-clinical-navy transition hover:bg-slate-50"
    >
      Request Early Access
    </button>
    ```
    With a `Link` component, using `block` and `text-center` styling for proper alignment:
    ```tsx
    <Link
      href="/#waitlist-form"
      id="pricing-solo-cta"
      className="mt-8 block w-full rounded-lg border-2 border-clinical-navy px-4 py-2.5 text-center text-sm font-semibold text-clinical-navy transition hover:bg-slate-50"
    >
      Request Early Access
    </Link>
    ```
  - **Small Practice Pricing CTA (Lines 370-376)**:
    Replace:
    ```tsx
    <button
      onClick={scrollToWaitlist}
      id="pricing-practice-cta"
      className="mt-8 w-full rounded-lg bg-clinical-navy px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-clinical-blue"
    >
      Request Early Access
    </button>
    ```
    With:
    ```tsx
    <Link
      href="/#waitlist-form"
      id="pricing-practice-cta"
      className="mt-8 block w-full rounded-lg bg-clinical-navy px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:bg-clinical-blue"
    >
      Request Early Access
    </Link>
    ```

### 4. Verification & Testing
- [ ] Run `npx tsc --noEmit` from the root directory to confirm there are no TypeScript compilation errors.
- [ ] Verify that the dev server compiles `app/page.tsx` successfully as a Server Component.
- [ ] Verify that navigation and visual hierarchy remain completely unchanged.
