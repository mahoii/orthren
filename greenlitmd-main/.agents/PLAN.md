# Implementation Plan - Populate Synthetic Patient Chart Sample Files

This plan outlines the steps to resolve the file loading issue where users receive the error:
`"The uploaded file appears to be empty or unreadable. Please try a different file."`

## Root Cause Analysis
The synthetic patient chart files in `public/samples/` (`clean-tka.txt`, `messy-rotator-cuff.txt`, and `incomplete-lumbar-fusion.txt`) were committed as empty (0-byte) files. When loaded through the frontend sample loader, they send empty files to the `/api/generate-pa` endpoint. The backend correctly checks `text.length < 100` and throws the validation error.

## Blueprint & Roadmap

We will populate each of the three sample files with highly realistic, clinically accurate, and structured synthetic patient orthopedic chart data that matches their frontend metadata and expected prior authorization criteria.

---

### [x] 1. Populate Clean TKA Chart Sample
- **Target File:** [clean-tka.txt](file:///c:/projects/health2/greenlitmd-main/public/samples/clean-tka.txt)
- **Metadata Context:** CPT `27447` | Payer `Aetna` | Provider `Jane Smith, MD` | Practice `NYU Langone Orthopedics`
- **Action:** Copy and write the full contents of `sample-chart.txt` from the project root into this file.

---

### [x] 2. Populate Messy Rotator Cuff Sample
- **Target File:** [messy-rotator-cuff.txt](file:///c:/projects/health2/greenlitmd-main/public/samples/messy-rotator-cuff.txt)
- **Metadata Context:** CPT `29827` | Payer `UnitedHealthcare` | Provider `Dr. Alex Mercer, MD` | Practice `Brooklyn Sports Medicine`
- **Action:** Write realistic medical chart text for a shoulder rotator cuff tear showing partial/failed conservative treatment and active shoulder symptoms.

---

### [x] 3. Populate Incomplete Lumbar Fusion Sample
- **Target File:** [incomplete-lumbar-fusion.txt](file:///c:/projects/health2/greenlitmd-main/public/samples/incomplete-lumbar-fusion.txt)
- **Metadata Context:** CPT `22630` | Payer `Cigna` | Provider `Dr. Sarah Jenkins, MD` | Practice `Spine & Joint Institute`
- **Action:** Write medical chart text representing an incomplete spinal fusion prior authorization candidate (e.g. insufficient physical therapy, missing prescription NSAIDs, pending lumbar MRI, and no injections) to trigger soft warnings and denial risk flags.

---

## Detailed Content Specifications for Execution

### [ ] Task 1: Populate `public/samples/clean-tka.txt`
Populate with:
```text
PATIENT CHART - ORTHOPEDIC EVALUATION

Patient Name: John Doe
Date of Birth: 01/15/1960
Age: 64
Sex: Male
Date of Visit: 05/10/2026

CHIEF COMPLAINT:
Right knee pain and functional decline over the past 18 months.

HISTORY OF PRESENT ILLNESS:
The patient is a 64-year-old male with progressive right knee osteoarthritis. He reports pain with walking, stairs, and prolonged standing. Functional limitations include inability to perform yard work, limited walking tolerance (approximately 15 minutes), and difficulty with recreational activities.

DIAGNOSIS:
- Right knee osteoarthritis, severe, with patellofemoral and tibiofemoral involvement
- ICD-10: M17.11 (Primary osteoarthritis, right knee)

CONSERVATIVE TREATMENTS ATTEMPTED:
1. Physical therapy: 8 weeks from January 2026 to March 2026. Patient completed the course but reported minimal functional improvement.
2. NSAIDs: Ibuprofen 400mg daily for 3 months. Provided temporary relief only.
3. Corticosteroid injection (Kenalog): Single injection on April 2026. Minimal relief, lasted 2 weeks.
4. Activity modification and bracing with knee sleeve: Ongoing since January 2026.

IMAGING FINDINGS:
Weight-bearing radiographs of bilateral knees performed 04/15/2026:
- Right knee: Kellgren-Lawrence Grade III changes bilaterally with joint space narrowing, osteophyte formation, and subchondral sclerosis.
- Left knee: Kellgren-Lawrence Grade II changes.

FUNCTIONAL LIMITATIONS:
- Walking limited to approximately 15 minutes
- Unable to climb stairs without significant pain and handrail support
- Unable to perform household chores (yard work, heavy lifting)
- Sleep disturbance due to nighttime pain
- Inability to drive long distances

SURGICAL INDICATION:
Right total knee arthroplasty (TKA) is recommended due to inadequate response to conservative measures and significant functional decline affecting activities of daily living.

Requesting Provider: Jane Smith, MD
Specialty: Orthopedic Surgery
Practice: NYU Langone Orthopedics

CPT Code Requested: 27447 (Total knee arthroplasty)
Insurance Payer: Aetna
```

### [ ] Task 2: Populate `public/samples/messy-rotator-cuff.txt`
Populate with:
```text
CLINICAL RECORD - SPORTS MEDICINE & ORTHOPEDICS

Patient Name: Robert Miller
Date of Birth: 05/12/1972
Age: 54
Sex: Male
Date of Evaluation: 05/15/2026

CHIEF COMPLAINT:
Left shoulder pain and weakness, worsening over the last 6 months.

HISTORY OF PRESENT ILLNESS:
Mr. Miller is a 54-year-old active male who presents with persistent, severe left shoulder pain, particularly aggravated by overhead movement and sleeping on his left side. He reports the pain started after lifting a heavy cooler in November 2025. He describes the pain as a dull ache punctuated by sharp pain on elevation.

DIAGNOSIS:
- Left shoulder rotator cuff tear, complete, non-traumatic
- ICD-10: M75.122 (Complete rotator cuff tear or rupture of left shoulder, not specified as traumatic)

CONSERVATIVE MANAGEMENT TRIED:
1. Physical therapy: Outpatient physical therapy attempted for 5 weeks starting in January 2026. Patient had to discontinue due to exacerbation of severe pain during resistive exercises.
2. Oral Medications: Tried Aleve (naproxen) 220mg BID for 4 weeks. Developed mild gastrointestinal irritation/reflux, discontinued.
3. Home Exercise Program: Attempted band exercises intermittently, but limited by pain.
4. Note: No corticosteroid injection has been performed yet, as the patient was hesitant about steroid side effects.

IMAGING STUDIES:
MRI Left Shoulder performed on 02/20/2026:
- Coronal and sagittal images reveal a full-thickness tear of the supraspinatus tendon measuring 1.8 cm with minimal retraction.
- Moderate subacromial bursitis.
- Mild AC joint arthrosis.

FUNCTIONAL DEFICITS & OBJECTIVE MEASUREMENTS:
- Left shoulder active abduction limited to 90 degrees due to pain and weakness (Passive ROM is intact to 160 degrees)
- Left shoulder active forward flexion limited to 105 degrees
- Positive Drop Arm Test on the left
- Positive Empty Can Test (Jobe's test) on the left
- Patient reports inability to reach overhead shelves, difficulty putting on a coat, and severe sleep disruption, waking up 3-4 times a night due to left shoulder pain.

PLAN & SURGICAL RECOMMENDATION:
Given the MRI evidence of a full-thickness supraspinatus tear, positive clinical signs, and the failure/intolerance of physical therapy and NSAIDs, we recommend surgical intervention.
Plan: Left shoulder arthroscopic rotator cuff repair (CPT 29827) and subacromial decompression.

Requesting Surgeon: Dr. Alex Mercer, MD
Clinic/Practice: Brooklyn Sports Medicine
Payer: UnitedHealthcare
```

### [ ] Task 3: Populate `public/samples/incomplete-lumbar-fusion.txt`
Populate with:
```text
SPINE SPECIALIST CLINICAL NOTE

Patient Name: Alice Thompson
Date of Birth: 08/24/1968
Age: 57
Sex: Female
Date of Visit: 05/18/2026

HISTORY OF PRESENT ILLNESS:
The patient is a 57-year-old female who presents with progressive, severe lower back pain radiating down both buttocks and posterior thighs to the calves. The symptoms have been present for over a year and are severely limiting her walking capacity (unable to walk more than 5 minutes without sitting). She describes the pain as 8/10 at worst.

DIAGNOSIS:
- Lumbar spondylolisthesis at L4-L5 with severe spinal stenosis
- ICD-10: M51.36 (Other intervertebral disc degeneration, lumbar region)

CONSERVATIVE CONCERNS / ACTIONS:
- Physical therapy: The patient reports she went to a physical therapist for only 2 sessions in March 2026 but stopped because she felt it was too painful. No formal course of PT was completed.
- Medications: Patient takes over-the-counter Tylenol occasionally. No trials of prescription NSAIDs or neuropathic medications (gabapentin/lyrica) are documented.
- Epidural Steroid Injections: Scheduled for next month, not yet performed.

IMAGING AND DIAGNOSTICS:
- Lumbar spine X-rays (04/02/2026): Demonstrates Grade I degenerative anterolisthesis of L4 on L5 with disc space narrowing and facet joint hypertrophy.
- MRI Lumbar Spine: Ordered on 05/10/2026; currently pending authorization/scheduling. MRI results are not yet completed or on file.

PHYSICAL EXAMINATION / CLINICAL OUTCOMES:
- Lumbar flexion restricted to 30 degrees due to severe low back pain
- Diminished Achilles reflexes bilaterally (1+)
- Bilateral straight leg raise test is positive at 45 degrees
- Severe claudication symptoms: walking tolerance is less than 50 yards.

PROPOSED PROCEDURE:
L4-L5 posterior lumbar interbody fusion (PLIF) is recommended to stabilize the spondylolisthesis and decompress the neural elements.
CPT Code Requested: 22630 (Lumbar interbody fusion)

Requesting Provider: Dr. Sarah Jenkins, MD
Practice Name: Spine & Joint Institute
Payer Name: Cigna
```

## Verification Plan

### Manual Verification
1. Boot up the local server (`npm run dev`).
2. Navigate to the main application page.
3. Click on each of the synthetic samples in the bottom container:
   - "Clean TKA Chart"
   - "Messy Rotator Cuff"
   - "Incomplete Lumbar Fusion"
4. Verify that each action populates the drop area, updates the CPT code, payer, and provider fields correctly.
5. Click **Generate PA Packet** and verify that:
   - The file is read successfully (no more "empty or unreadable" error).
   - The document and PA strength score generate correctly.
