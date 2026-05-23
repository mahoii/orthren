# Implementation Plan - Support Plain Text (.txt) Files for Synthetic Testing

This plan details the steps to fully support `.txt` files in the prior authorization generation workflow.

## 1. Backend Verification (`app/api/generate-pa/route.ts`)
- [ ] Inspect the `extractChartText` function starting at line 188.
- [ ] Confirm that `isTxt` is defined: `const isTxt = chart.type === "text/plain" || lowerName.endsWith(".txt");`
- [ ] Confirm the file format restriction check permits txt: `if (!isPdf && !isDocx && !isTxt)`
- [ ] Confirm the extraction logic bypasses binary buffer parsing for txt:
  ```typescript
  if (isPdf) {
    text = await extractPdfText(chart);
  } else if (isDocx) {
    text = await extractDocxText(chart);
  } else {
    // Standard plain-text file — read directly
    text = await chart.text();
  }
  ```
- [ ] No changes are required if these checks are already in place and correct.

## 2. Frontend Updates (`app/page.tsx`)
- [ ] Modify `selectChartFile` (around line 63) to allow `.txt` file validation:
  - Add `const isTxt = selectedFile.type === "text/plain" || lowerName.endsWith(".txt");`
  - Update the validation check to:
    ```typescript
    if (!isPdf && !isDocx && !isTxt) {
      setError("Only PDF, DOCX, and TXT files are supported");
      return;
    }
    ```
- [ ] Modify the file `<input>` element (around line 251):
  - Update the `accept` attribute to include `.txt` and `text/plain`:
    ```html
    accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain"
    ```
- [ ] Update the UX helper text on line 272:
  - Change `"or click to browse - PDF or DOCX supported"` to `"or click to browse - PDF, DOCX, or TXT supported"`.

## Verification Steps
- [ ] Run the application with `npm run dev`.
- [ ] Drag-and-drop a `.txt` file (e.g. `public/samples/clean-tka.txt` or `messy-rotator-cuff.txt`) to the drop area.
- [ ] Verify that no frontend validation crash or error is thrown.
- [ ] Verify that manual browse file dialog allows selecting `.txt` files.
- [ ] Submit the form and ensure the real API pipeline successfully extracts medical necessity criteria and generates the letter using the plain text contents.
