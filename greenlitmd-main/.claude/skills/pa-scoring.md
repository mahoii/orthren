# Skill: Orthopedic Prior Auth Scoring Rubric

## Weight Matrix
- diagnosis_codes: 10%
- conservative_treatments_named: 20%
- conservative_treatment_duration: 10%
- imaging_findings: 15% (Strict Rule: imaging modality must be fully verified. Output null if labeled 'not ordered' or missing).
- functional_limitations: 15%
- surgical_approach: 10%
- cpt_code_valid: 10%
- symptom_duration: 10%

## Triage UI Parameters
- Score < 5.0: Red Alert state context
- Score 5.0 - 7.9: Amber warning boundaries
- Score >= 8.0: Green authorized clearance UI