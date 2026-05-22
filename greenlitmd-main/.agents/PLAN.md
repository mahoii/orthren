# PLAN.md - Greenlit MD Features Implementation

This plan outlines the design and step-by-step implementation for adding two new features to Greenlit MD: **Demo Mode / Sample Chart** and **Copy-to-Clipboard on Chart Data Tab**.

---

## FEATURE 1: Demo Mode / Sample Chart

### Goal
Add a "Try a sample chart" flow on the upload page (app/page.tsx) that lets users run a full demo without uploading a real file. The demo should use pre-loaded static data and simulate the generation flow.

### Proposed Implementation Details

1. **Button Placement & Styling**:
   - Add an `"or try a sample chart →"` button/link immediately below the drag-and-drop label on `app/page.tsx`.
   - Style: Sleek slate link (`text-slate-500 hover:text-clinical-blue transition-colors text-sm font-medium mt-3 block text-center`).
   
2. **State & Pre-filling**:
   - Introduce an `isDemoMode` boolean state (defaulting to `false`) in the `UploadPage` component.
   - When clicked:
     - Set `isDemoMode` to `true`.
     - Clear any existing validation/upload errors.
     - Pre-fill the state for input fields:
       - CPT Code: `27447`
       - Payer Name: `BlueCross BlueShield`
       - Provider Name: `Dr. R. Chambers, MD`
       - Practice Name: `Westbrook Orthopedic Surgery Center`
   - Revert `isDemoMode` to `false` if the user manually uploads/drops a file or drags a file into the upload zone.
   - In the dropzone UI, if `isDemoMode` is active and no real `file` is selected, display `"Maria_Delgado_Chart.pdf"` (or similar realistic filename) instead of the default drag/drop prompt.

3. **Form Submission Behavior**:
   - Update `hasRequiredFields` so it resolves to `true` when either `file` is present OR `isDemoMode` is active (in addition to the required text inputs).
   - In `handleSubmit`, if `isDemoMode` is active, skip the POST call to `/api/generate-pa`.
   - To make the demo engaging and snappy while still showcasing the UI steps, use a **1000ms interval shortcut** (4000ms total duration) for the progress animation:
     ```typescript
     const intervalTime = isDemoMode ? 1000 : 7000;
     ```
   - After the steps complete, write `DEMO_PA_DATA` directly into `sessionStorage` under the key `"pa-review-data"`, injecting an extra `isDemo: true` flag.
   - Call `router.push("/review")`.

4. **Demo Data Storage**:
   - Create a helper file `lib/demo-data.ts` to host the complete static `DEMO_PA_DATA` matching the `GeneratePaResponse` structure.
   - The file will contain:
     - A professionally structured, high-quality Letter of Medical Necessity for Maria Delgado / Dr. R. Chambers.
     - Complete extracted metadata containing patient information, bilaterally matching osteoarthritis diagnostics, attempted treatments, imaging, functional limitations, and realistic risk scoring elements.

5. **Review Page Integration**:
   - Add `isDemo?: boolean` to the `ReviewData` type on `app/review/page.tsx`.
   - Display a subtle `Demo — sample patient data` amber badge near the top header if `data.isDemo` is true.
   - Disable the "Download PA Packet" button in demo mode and add a title-based hover tooltip: `"Download available with a real chart"`.

---

## FEATURE 2: Copy-to-Clipboard on Chart Data Tab

### Goal
Add a copy icon button to each data point in the Chart Data tab on the review page (`app/review/page.tsx`) so billing staff can copy individual values directly into payer portal fields.

### Proposed Implementation Details

1. **Modify `DataRow` Component**:
   - Accept an optional `copyable?: boolean` prop on `DataRow`.
   - Add a local `copied` state: `const [copied, setCopied] = useState(false);`
   
2. **Copy Action**:
   - If clicked and `value` is non-null/non-empty, execute:
     `navigator.clipboard.writeText(textToCopy)`
   - If the value is an array (like `diagnosis_codes`), join elements with `", "` before writing to the clipboard. Keep the screen rendering as is (which uses `"; "` separation).

3. **User Feedback (Copied Confirmation)**:
   - When a copy succeeds, set `copied` to `true`.
   - Revert to `false` after 1500ms using a standard `setTimeout`.
   - If `copied` is true, render a green checkmark icon in place of the clipboard icon.

4. **Styling & Alignment**:
   - Render a small, unobtrusive clipboard icon (14x14px, `text-slate-400 hover:text-slate-700`).
   - Position it on the far right of the header line of the `DataRow` (using flex spacing `justify-between`).

5. **Copyable Fields**:
   - Pass `copyable: true` to the following `DataRow` instances:
     - Patient name
     - Date of birth
     - Diagnosis codes
     - Primary complaint
     - Symptom duration
     - Requested procedure
     - Functional limitations
   - Leave `surgical_approach_if_mentioned` and `objective_measurements` as default (not copyable).
   - Do not add copy buttons to imaging findings or treatments.

6. **Value Validity Check**:
   - Only render the copy button when the underlying value is present and non-empty. If the value is null/missing, only show the existing `"Missing"` warning badge without the copy button.

---

## Constraints Verification
- Absolutely no modifications will be made to API routes or the `GeneratePaResponse`/`ExtractedChartData` types.
- No new external dependencies will be added.
- All original styling, layout structure, and TS rules will be preserved.
