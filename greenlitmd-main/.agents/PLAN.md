# Plan - Update next.config.mjs to Next.js 14 Stable Server Actions Syntax

This plan details the change to adjust the `next.config.mjs` structure, moving the `serverActions` property from `experimental` to the top-level configuration config block to conform with stable Next.js 14 syntax.

---

## 📋 Execution Checklist

### 1. Update next.config.mjs Config Block
- [ ] Open [next.config.mjs](file:///c:/projects/health2/greenlitmd-main/next.config.mjs).
- [ ] Replace the config structure to position `serverActions` as a top-level configuration object:
  ```javascript
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    serverActions: {
      allowedOrigins: [
        "greenlitmd.app",
        "www.greenlitmd.app",
        "*.vercel.app" // Allows Vercel preview branch deployments to work
      ]
    }
  };

  export default nextConfig;
  ```

### 2. Verification
- [ ] Verify that no TypeScript or Next.js build compilation errors are present by confirming dev server compilation or checking type emission checks.
