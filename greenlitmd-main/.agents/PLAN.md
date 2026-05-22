# PLAN.md - Robust JSON Extraction, Parsing, and Normalization

This plan details the design and step-by-step implementation for making the JSON extraction, parsing, and normalization pipeline inside `app/api/generate-pa/route.ts` completely resilient against malformed LLM outputs, partial responses, or structurally incomplete JSON objects.

---

## 1. Goal
Ensure that no matter how malformed, truncated, or structurally incomplete the JSON returned by Anthropic Claude is, our Next.js backend cleanly parses, validates, and normalizes the data. This guarantees that the React review screen (`app/review/page.tsx`) never throws runtime errors (such as "Cannot read properties of undefined" or ".map is not a function") and displays fallback placeholder values gracefully.

---

## 2. Proposed Implementation Details

### A. Defensive Regex Boundary Parsing (`parseJsonObject`)
1. Refactor the existing `parseJsonObject(content)` function or replace it with an optimized regex parser.
2. Scan the input text (`content`) for JSON boundaries using `/\{[\s\S]*\}/`.
3. If a match is found:
   - Extract the matched string.
   - Strip any accidental code-fence wrappers (like ````json` or ````) and trim whitespace.
4. If no match is found:
   - Cleanly fallback to the raw `content` trimmed of preambles/postambles.
5. Clean out illegal control characters using a regex like `/[\u0000-\u001F\u007F-\u009F]/g` before executing `JSON.parse()`.

---

### B. Strict Structural Normalization Layer (`normalizeChartData`)
Modify `normalizeChartData(data, requestDetails, chartText)` to enforce guaranteed properties and types:

1. **Critical String Fields**:
   - `patient_name`, `primary_complaint`, `symptom_duration`, and `requested_procedure` must be strings. If missing, null, or falsy, they must default to `"Not Documented"`.

2. **Numerical Fields**:
   - `bmi`: Safely parse it. If it is a string containing numbers (e.g., `"BMI 28.5"`), extract the numeric portion using `/d+(?:.d+)?/` and cast it to a Number. Otherwise, default to `null`.
   - `asa_classification`: Cast it safely to a string or `null` (e.g. `String(val).trim() || null`).

3. **Flat Arrays**:
   - Ensure `diagnosis_codes`, `functional_limitations`, and `denial_risk_flags` are strictly verified using `Array.isArray()`. Default to `[]` if missing, falsy, or of any other type.

4. **Conservative Treatments (Crucial Array of Objects)**:
   - Check if `conservative_treatments_attempted` is a valid array. If not, default to `[]`.
   - Map each element to an object:
     - If the element is a **flat string**, parse it into:
       ```json
       {
         "treatment": "the string",
         "treatment_name": "the string",
         "duration": "Unknown",
         "dates": "Not documented",
         "outcome": "Failed"
       }
       ```
     - If the element is an **object**, verify key safety and fallback as follows:
       - `treatment_name` / `treatment`: fallback to `"Unknown Treatment"`.
       - `duration`: fallback to `"Unknown"`.
       - `dates`: fallback to `"Not documented"`.
       - `outcome`: fallback to `"Failed"`.
     - Assign both `treatment` and `treatment_name` on each returned item to satisfy both `types.ts` specifications and LLM key variations.

5. **Nested Imaging Findings Object**:
   - Ensure `imaging_findings` is always an object (never null or undefined).
   - Feats keys: `modality` (string | null), `key_findings` (string | null), and `findings` (string | null).
   - If missing or not an object, default to:
     ```json
     {
       "modality": null,
       "key_findings": null,
       "findings": null
     }
     ```

6. **Nested Validation Object (Critical for PA Strength Meter)**:
   - Ensure `validation` is present.
   - Guarantee `validation.hard_blocks` and `validation.soft_warnings` are always arrays (default to `[]`).
   - Parse each element inside these arrays cleanly to ensure they have `field`, `label`, and `message` properties.
   - Force `validation.pa_strength` to be a valid number between `1` and `10`. If missing, falsy, or a string, default it safely to `1`.

---

### C. Catastrophic Try-Catch Fallback
1. Wrap the entire parsing phase in `extractChartData` within a `try/catch` block.
2. If `JSON.parse` or `normalizeChartData` throws a catastrophic exception (e.g. LLM outputs truncated/unparseable junk), catch it and populate a **perfect fallback JSON object**:
   - Conforms fully to `ExtractedChartDataWithValidation` structure.
   - `patient_name`, `primary_complaint`, `symptom_duration`, and `requested_procedure` set to `"Not Documented"`.
   - `denial_risk_flags` contains: `["CATASTROPHIC PARSING ERROR: The AI clinical data extractor returned a malformed response that could not be parsed. All values have defaulted to 'Not Documented'. Please manually enter all patient information below to remediate this record."]`.
   - `validation.hard_blocks` contains visual clinical warnings mapping the critical required fields (`patient_name`, `requested_procedure`, `diagnosis_codes`) so they are flagged as missing on the review screen.
   - Do not crash the server; return the fallback object gracefully.

---

## 3. Integration Safeguard
- Do NOT modify the file text extraction logic (using `pdf-parse` or `mammoth`).
- Do NOT modify the primary system prompts or subsequent Claude calls generating the LOMN.
- Maintain route imports and exports as they currently are.
