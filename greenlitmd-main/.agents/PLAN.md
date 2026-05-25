# Plan - Support Multi-Profile Testing in Zero-Risk Public Sandbox Route

This plan details the addition of three distinct static patient profiles inside the sandbox `/sandbox` page. This allows prospective users to test the prior authorization builder under three unique clinical archetypes:
1. **Clean TKA** (Maria Delgado — High Score / BCBS)
2. **Messy Rotator Cuff** (Robert Chen — Intermediate Score / UHC)
3. **Incomplete Lumbar Fusion** (Eleanor Vance — Low Score / Cigna)

---

## 📋 Execution Checklist

### 1. Expand Sample Profiles in `lib/demo-data.ts`
- [x] Open [lib/demo-data.ts](file:///c:/projects/health2/greenlitmd-main/lib/demo-data.ts).
- [x] Keep `DEMO_PA_DATA` exactly as is to prevent regressions or compiler bugs elsewhere.
- [x] Export three static response objects of type `GeneratePaResponse`:
  - [x] **`CLEAN_TKA`**: Alias to `DEMO_PA_DATA` — CPT 27447 / BlueCross BlueShield / Dr. R. Chambers, MD / Maria A. Delgado / High score (≈ 8.0).
  - [x] **`MESSY_ROTATOR_CUFF`**: Robert Chen / CPT 29827 / UHC / Dr. Alex Mercer, MD / Brooklyn Sports Medicine / Intermediate score (≈ 7.0). Missing surgical approach detail and precise symptom duration.
  - [x] **`INCOMPLETE_LUMBAR_FUSION`**: Eleanor Vance / CPT 22630 / Cigna / Dr. Sarah Jenkins, MD / Spine & Joint Institute / Low score (≈ 4.5). Hard blocks for missing PT and missing advanced imaging (MRI/CT).
    - Patient: "Robert Chen" (DOB: 11/14/1978).
    - CPT: 29827 (Rotator cuff repair arthroscopic).
    - Payer: "UnitedHealthcare".
    - Provider: "Dr. Alex Mercer, MD".
    - Practice: "Brooklyn Sports Medicine".
    - Target PA Strength Score: **7.5** (Weighted factors: 10 + 10 + 10 + 20 + 15 + 10 = 75 / 100).
      - `diagnosis_codes`: 1 (`score: 1`, note: "Primary diagnosis of right rotator cuff tear (M75.121) is fully documented.")
      - `conservative_treatments_named`: 1 (`score: 1`, note: "PT, NSAIDs, and subacromial injections are all documented.")
      - `conservative_treatment_duration`: 1 (`score: 1`, note: "PT was completed for 6 weeks, satisfying duration guidelines.")
      - `imaging_findings`: 1 (`score: 1`, note: "MRI confirming full-thickness supraspinatus tear is present.")
      - `functional_limitations`: 1 (`score: 1`, note: "Multiple limitations (lifting, sleeping, grooming) are documented.")
      - `surgical_approach`: 0 (`score: 0`, note: "Arthroscopic approach is mentioned but lacks specific portal/technique details.")
      - `cpt_code_valid`: 1 (`score: 1`, note: "CPT 29827 is a recognized orthopedic code.")
      - `symptom_duration`: 0 (`score: 0`, note: "Symptom duration is noted as 'several months' in narrative but lacks a precise timeline.")
    - Soft warnings in validation for `surgical_approach` and `symptom_duration`.
    - Appeal letter text drafting an arthroscopic double-row rotator cuff repair appeal.
  - [ ] **`INCOMPLETE_LUMBAR_FUSION`**:
    - Patient: "Eleanor Vance" (DOB: 04/05/1966).
    - CPT: 22630 (Lumbar interbody fusion).
    - Payer: "Cigna".
    - Provider: "Dr. Sarah Jenkins, MD".
    - Practice: "Spine & Joint Institute".
    - Target PA Strength Score: **4.5** (Weighted factors: 10 + 10 + 10 + 15 = 45 / 100).
      - `diagnosis_codes`: 1 (`score: 1`, note: "Diagnosis of lumbar disc displacement (M51.26) is documented.")
      - `conservative_treatments_named`: 0 (`score: 0`, note: "No structured conservative treatments (PT, chiropractic) are documented.")
      - `conservative_treatment_duration`: 0 (`score: 0`, note: "Duration of conservative treatments is completely missing.")
      - `imaging_findings`: 0 (`score: 0`, note: "Only X-ray findings are present; MRI or CT is missing to confirm spinal stenosis/nerve compression.")
      - `functional_limitations`: 1 (`score: 1`, note: "Severe walking and sitting limitations are documented.")
      - `surgical_approach`: 1 (`score: 1`, note: "PLIF approach is clearly documented.")
      - `cpt_code_valid`: 1 (`score: 1`, note: "CPT 22630 is a valid lumbar fusion surgical code.")
      - `symptom_duration`: 0 (`score: 0`, note: "Symptom duration is noted as 6 months but lacks conservative therapy alignment.")
    - Hard blocks in validation calling out missing physical therapy and missing MRI/CT advanced imaging.
    - Appeal letter text drafting a PLIF appeal, calling out the critical documentation gaps.

### 2. Update Sandbox Page Component (`app/sandbox/page.tsx`)
- [ ] Open [app/sandbox/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/sandbox/page.tsx).
- [ ] Import `CLEAN_TKA`, `MESSY_ROTATOR_CUFF`, and `INCOMPLETE_LUMBAR_FUSION` from `@/lib/demo-data`.
- [ ] Add state tracking the active profile archetype:
  ```typescript
  type ProfileType = "CLEAN_TKA" | "MESSY_ROTATOR_CUFF" | "INCOMPLETE_LUMBAR_FUSION";
  const [activeProfile, setActiveProfile] = useState<ProfileType>("CLEAN_TKA");
  ```
- [ ] Define the profile metadata mapping structure locally or import it to swap form fields and file attachment labels dynamically:
  - **`CLEAN_TKA`**:
    - CPT: `"27447"`
    - Payer: `"BlueCross BlueShield"`
    - Provider: `"Dr. R. Chambers, MD"`
    - Practice: `"Westbrook Orthopedic Surgery Center"`
    - File Name: `"Maria_Delgado_Chart.pdf"`
  - **`MESSY_ROTATOR_CUFF`**:
    - CPT: `"29827"`
    - Payer: `"UnitedHealthcare"`
    - Provider: `"Dr. Alex Mercer, MD"`
    - Practice: `"Brooklyn Sports Medicine"`
    - File Name: `"robert_chen_dictation.docx"`
  - **`INCOMPLETE_LUMBAR_FUSION`**:
    - CPT: `"22630"`
    - Payer: `"Cigna"`
    - Provider: `"Dr. Sarah Jenkins, MD"`
    - Practice: `"Spine & Joint Institute"`
    - File Name: `"eleanor_vance_chart.txt"`
- [ ] Render the 3-button profile selector component at the top of the form, allowing users to switch between cases. Style it as interactive, premium pill tabs.
- [ ] Make all field values readOnly to maintain the controlled sandbox environment.
- [ ] In `handleSubmit`:
  - Run the 800ms per step animated loader.
  - Deep-copy the active profile's mock response:
    ```typescript
    const profileData =
      activeProfile === "CLEAN_TKA"
        ? CLEAN_TKA
        : activeProfile === "MESSY_ROTATOR_CUFF"
        ? MESSY_ROTATOR_CUFF
        : INCOMPLETE_LUMBAR_FUSION;
    ```
  - Overwrite top-level metadata in the serialized payload:
    ```typescript
    sessionStorage.setItem(
      "pa-review-data",
      JSON.stringify({
        ...profileData,
        cptCode: formCpt,
        payerName: formPayer,
        providerName: formProvider,
        practiceName: formPractice,
        isDemo: true
      })
    );
    ```
  - Direct Next.js router navigation to `/review`.

### 3. Verification & Safety Checks
- [ ] Validate type parameters with `npx tsc --noEmit`.
- [ ] Manually verify UI transitions are fully functional and error-free.
