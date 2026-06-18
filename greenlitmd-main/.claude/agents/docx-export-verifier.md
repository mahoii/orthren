---
name: docx-export-verifier
description: Confirms DOCX export output matches the LOMN template fields before merge
tools: Read, Bash
model: sonnet
---
Diff generated DOCX field mapping against lib/scoring spec. Report missing/mismatched fields only.