# Plan - Sandbox/Upload UI Demo-Case Integration

This plan implements three distinct Test Case buttons ("Clean TKA", "Messy OCR (Rotator Cuff)", and "Incomplete Lumbar Fusion") on the frontend upload page (`app/builder/page.tsx`). Clicking any of these buttons auto-fills the form fields with their respective profile metadata, simulates a 1.5-second loading state, saves the static mock response from `src/lib/demo-data.ts` to `sessionStorage`, and routes the user to `/review` without calling the real API. 

The drag-and-drop file upload zone remains fully functional and continues to call the real API for user-provided clinical charts.

---

## 📋 Execution Checklist

### 1. Update Imports and Setup Metadata Maps in `app/builder/page.tsx`
- [ ] Open [app/builder/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/builder/page.tsx).
- [ ] Replace the import of `DEMO_PA_DATA` with the multi-profile imports from `@/lib/demo-data`:
  ```typescript
  import { CLEAN_TKA, MESSY_ROTATOR_CUFF, INCOMPLETE_LUMBAR_FUSION } from "@/lib/demo-data";
  ```
- [ ] Define the `ProfileKey` and `profileMap` structures outside the main `UploadPage` component:
  ```typescript
  type ProfileKey = "CLEAN_TKA" | "MESSY_ROTATOR_CUFF" | "INCOMPLETE_LUMBAR_FUSION";

  const profileMap = {
    CLEAN_TKA: {
      data: CLEAN_TKA,
      cpt: "27447",
      payer: "BlueCross BlueShield",
      provider: "Dr. R. Chambers, MD",
      practice: "Westbrook Orthopedic Surgery Center",
      fileName: "Maria_Delgado_Chart.pdf"
    },
    MESSY_ROTATOR_CUFF: {
      data: MESSY_ROTATOR_CUFF,
      cpt: "29827",
      payer: "UnitedHealthcare",
      provider: "Dr. Alex Mercer, MD",
      practice: "Brooklyn Sports Medicine",
      fileName: "robert_chen_dictation.docx"
    },
    INCOMPLETE_LUMBAR_FUSION: {
      data: INCOMPLETE_LUMBAR_FUSION,
      cpt: "22630",
      payer: "Cigna",
      provider: "Dr. Sarah Jenkins, MD",
      practice: "Spine & Joint Institute",
      fileName: "eleanor_vance_chart.txt"
    }
  };
  ```

### 2. Introduce Component State Variables
- [ ] Inside the `UploadPage` component, add a state variable for tracking the selected Test Case:
  ```typescript
  const [activeTestCase, setActiveTestCase] = useState<ProfileKey | null>(null);
  ```
- [ ] Ensure that when a custom file is dropped/uploaded, the `activeTestCase` is cleared:
  - Inside `selectChartFile`:
    ```typescript
    setActiveTestCase(null);
    ```

### 3. Implement the `triggerTestCase` Function
- [ ] Create the `triggerTestCase` function inside the component to execute the auto-fill and simulated loading workflow:
  ```typescript
  async function triggerTestCase(key: ProfileKey) {
    if (isLoading) return;

    setError(null);
    setIsLoading(true);
    setActiveStep(0);
    setActiveTestCase(key);
    setIsDemoMode(true);
    setFile(null);

    const profile = profileMap[key];
    
    // Auto-fill fields
    setCptCode(profile.cpt);
    setPayerName(profile.payer);
    setProviderName(profile.provider);
    setPracticeName(profile.practice);

    // Simulate 1.5-second loading state (375ms per step for 4 steps)
    const stepInterval = 1500 / progressSteps.length;
    const progressTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, stepInterval);

    try {
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, 1500)
      );

      sessionStorage.setItem(
        "pa-review-data",
        JSON.stringify({
          ...profile.data,
          cptCode: profile.cpt,
          payerName: profile.payer,
          providerName: profile.provider,
          practiceName: profile.practice,
          isDemo: true
        })
      );
      router.push("/review");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to run simulation.");
    } finally {
      window.clearInterval(progressTimer);
      setIsLoading(false);
    }
  }
  ```

### 4. Update the Form Submit Handler `handleSubmit` for Safety & Redundancy
- [ ] Modify `handleSubmit` in `app/builder/page.tsx` to safely handle submitting when `activeTestCase` is active:
  ```typescript
  // If an active test case is selected, simulate the 1.5-second loading state and save the correct JSON profile
  if (activeTestCase) {
    const stepInterval = 1500 / progressSteps.length;
    const progressTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, stepInterval);

    try {
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, 1500)
      );

      const profile = profileMap[activeTestCase];
      sessionStorage.setItem(
        "pa-review-data",
        JSON.stringify({
          ...profile.data,
          cptCode: cptCode.trim(),
          payerName: payerName.trim(),
          providerName: providerName.trim(),
          practiceName: practiceName.trim(),
          isDemo: true
        })
      );
      router.push("/review");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to run simulation.");
    } finally {
      window.clearInterval(progressTimer);
      setIsLoading(false);
    }
    return;
  }
  ```

### 5. Update UI Labels, Dropzone, and Test Case Buttons
- [ ] Update the drag-and-drop zone labels to reflect the active Test Case:
  - File name display:
    ```typescript
    {file
      ? file.name
      : activeTestCase
      ? profileMap[activeTestCase].fileName
      : isDemoMode
      ? "Maria_Delgado_Chart.pdf"
      : "Drag and drop the patient chart here"}
    ```
  - Subtext display:
    ```typescript
    {file && !isDemoMode
      ? "Chart loaded — ready to generate"
      : activeTestCase
      ? "Test case loaded — ready to generate"
      : isDemoMode
      ? "Sample chart loaded — ready to generate"
      : "or click to browse - PDF, DOCX, or TXT supported"}
    ```
  - Demo mode tag block:
    ```typescript
    {(isDemoMode || activeTestCase) && !file ? (
      <span className="mt-4 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        Demo — sample patient data
      </span>
    ) : null}
    ```
- [ ] Replace the legacy "No chart handy? Load a synthetic sample:" section with the new "Interactive Demo Test Cases" layout:
  ```tsx
  <div className="rounded-lg border border-clinical-line bg-white px-5 py-4">
    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-clinical-navy">
      Interactive Demo Test Cases (1.5s Mock Generation):
    </p>
    <div className="flex flex-wrap gap-2">
      {([
        {
          label: "Clean TKA",
          key: "CLEAN_TKA"
        },
        {
          label: "Messy OCR (Rotator Cuff)",
          key: "MESSY_ROTATOR_CUFF"
        },
        {
          label: "Incomplete Lumbar Fusion",
          key: "INCOMPLETE_LUMBAR_FUSION"
        }
      ] as const).map(({ label, key }) => (
        <button
          key={key}
          type="button"
          disabled={isLoading}
          onClick={() => triggerTestCase(key)}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            activeTestCase === key
              ? "border-clinical-navy bg-clinical-navy text-white"
              : "border-clinical-line bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
  ```

### 6. Verification and Type Checking
- [ ] Run `npx tsc --noEmit` from the root directory to confirm the build succeeds with zero compiler/TypeScript errors.
