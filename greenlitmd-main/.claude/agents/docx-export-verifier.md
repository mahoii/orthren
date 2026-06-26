---
name: docx-export-verifier
description: "Verifies DOCX export output contains all required letter fields and has no structural defects (double sig block, missing Re: line, CPT mismatch). Run after any change to /api/export, /api/regenerate-denial-fix, or postProcessLetter."
tools: Read, Bash
model: sonnet
---
Check the generated DOCX output against these requirements:
1. Re: line format — must include patient name, DOB, procedure name, CPT code, and ICD-10 code
2. Single signature block only — flag if more than one "Sincerely" or sig block exists
3. CPT code in header matches CPT code in letter body and Re: line
4. Patient name and DOB present and consistent throughout
5. postProcessLetter applied — no raw placeholder tokens remaining
6. Submission checklist present with correct pending items

Report only failures. No output if all pass.