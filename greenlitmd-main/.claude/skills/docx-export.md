# Skill: LOMN Generation Field Map Structure

Ensure generated DOCX streams inside `/api/export` directly map:
1. Standard Institutional Header Block (Current Runtime Date, Target Carrier Payer Matrix, Patient Demographics Meta).
2. Documented History of Present Illness (Functional impairments, ADL Metrics).
3. Chronological Failure Grid (Explicitly map treatment durations, names, and drug outcomes. Never return 'not documented' strings).
4. Confirmed Radiographic Validation Section.
5. Surgical Approach Specification Details + Single Provider Block Footer.