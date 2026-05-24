# Implementation Plan - Integrate Brand Logo and Configure Favicon

This plan outlines the steps to integrate the primary brand logo (`public/logo.png`) into the global layout header, verify the sidebar header requirements, and configure Next.js metadata to cleanly support the favicon (`app/icon.png`).

---

## 1. Global Header Integration
- **Target File:** [layout.tsx](file:///c:/projects/health2/greenlitmd-main/app/layout.tsx)
- **Goal:**
  - Import the `Image` component from `next/image`.
  - Update the `<header>` element to be sticky by adding `sticky top-0 z-50` classes.
  - Inside the `<Link href="/">` component, insert the logo image lockup before the "Greenlit MD" text.
  - Render the logo using `<Image src="/logo.png" alt="Greenlit MD Logo" width={32} height={32} priority className="h-8 w-8 object-contain" />`.

### Proposed Diff Checklist:
- [ ] Import `Image` from `next/image` at the top of the file.
- [ ] Modify `<header>` class string to include `sticky top-0 z-50`.
- [ ] Inject `<Image>` component into the `Link` element preceding the brand text.

---

## 2. Favicon & Metadata Configuration
- **Target File:** [layout.tsx](file:///c:/projects/health2/greenlitmd-main/app/layout.tsx)
- **Goal:**
  - Leverage Next.js 14 App Router's built-in file-based metadata system to automatically pick up `app/icon.png` as the site's favicon.
  - Remove the manual, hardcoded `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />` from the `<head>` to prevent browser cache conflict and allow clean automatic favicon generation from `app/icon.png`.

### Proposed Diff Checklist:
- [ ] Delete line 18 (`<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`) inside `<head>`.

---

## 3. Sidebar Header Verification
- **Target File:** [page.tsx](file:///c:/projects/health2/greenlitmd-main/app/review/page.tsx)
- **Goal:**
  - Check the review page layout for any placeholder sidebar branding headers.
  - **Findings:** A full audit of `<aside>` in `app/review/page.tsx` shows that there is no existing brand header or placeholder text at the top of the sidebar. It starts directly with the tab navigation pill container.
  - **Action:** No brand header replacement is necessary in the sidebar since none exists, keeping the UI minimal and adhering strictly to the current component design without adding unsolicited layout wrappers.

---

## Verification Plan

### Automated/Dev Server Verification:
1. Start the Next.js development server:
   ```bash
   npm run dev
   ```
2. Navigate to `http://localhost:3000` in the browser.
3. Verify that the global header is sticky when scrolling (if applicable).
4. Verify that the logo image (`public/logo.png`) renders beautifully at 32x32px next to the "Greenlit MD" text.
5. Verify that clicking the logo lockup navigates to the home page `/`.
6. Inspect the page source or head elements to confirm that Next.js auto-generated `<link rel="icon" ...>` referencing `icon.png`.
7. Go to `/review` (using a demo chart or past session) and verify the page structure is unaffected and clean.
