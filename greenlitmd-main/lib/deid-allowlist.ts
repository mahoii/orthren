// Shared, PURE-DATA allowlist for the fail-closed residual-span pass in
// lib/deidentify.ts and the independent mirror detector in lib/deid-verify.ts.
//
// This module imports nothing and exports only data + a lookup helper, so both
// the redaction module and the verifier can share ONE source of truth without a
// logic dependency (deid-verify.ts's independence policy permits sharing pure
// data constants, never detection regexes).
//
// The residual pass is deliberately dumb and aggressive: it flags ANY
// capitalized word or multi-word capitalized phrase that is not matched here.
// Growing this list is the intended tuning path -- every false positive is a
// one-line add. A miss here over-masks a clean clinical term (recoverable,
// measured as the FP rate); a miss in redaction leaks a name. We bias toward
// the former on purpose.
//
// Lookups are case-insensitive and whitespace-normalized. Multi-word brand/
// compound units (e.g. "Zimmer NexGen") are stored as whole phrases so a
// multi-word match passes as a unit. Their individual tokens are USUALLY also
// listed so each passes when it appears alone -- EXCEPT where a token is
// itself a real surname (device brands Smith/Wright/Zimmer/Stryker, product
// line Oxford, payer tokens Cross/Shield, every bare eponym surname). Those
// are deliberately phrase-only: see the per-category notes below.

// ── Common capitalized English / sentence-starter / function words ──────────
// The single largest false-positive surface: every sentence-initial word in a
// clinical note is capitalized. Without these, ordinary prose is shredded.
const COMMON_WORDS = [
  "The", "This", "That", "These", "Those", "There", "Then", "Than", "Thus",
  "He", "She", "They", "His", "Her", "Hers", "Their", "Theirs", "It", "Its",
  "We", "Our", "Ours", "Us", "You", "Your", "Yours", "Him", "Them", "Who",
  "Whom", "Whose", "What", "Which", "When", "Where", "Why", "How", "Whether",
  "A", "An", "And", "Or", "But", "Nor", "So", "Yet", "For", "Of", "In", "On",
  "At", "To", "By", "As", "If", "Is", "Are", "Was", "Were", "Be", "Been",
  "Being", "Has", "Have", "Had", "Do", "Does", "Did", "Will", "Would", "Shall",
  "Should", "Can", "Could", "May", "Might", "Must", "With", "Without", "Within",
  "From", "Into", "Onto", "Upon", "Over", "Under", "Above", "Below", "After",
  "Before", "During", "Since", "Until", "While", "Because", "Although",
  "Though", "However", "Also", "Additionally", "Furthermore", "Moreover",
  "Therefore", "Thus", "Hence", "Meanwhile", "Otherwise", "Overall", "Per",
  "Via", "Due", "Both", "Either", "Neither", "All", "Any", "Some", "None",
  "Each", "Every", "Few", "Many", "More", "Most", "Much", "Several", "Such",
  "Only", "Own", "Same", "Other", "Others", "Another", "Very", "Just", "Now",
  "Not", "No", "Yes", "Nil", "Here", "New", "Old", "Per", "About", "Around",
  "Between", "Through", "Throughout", "Toward", "Towards", "Against", "Along",
  "Given", "Following", "Regarding", "Including", "Approximately", "Currently",
  "Previously", "Initially", "Subsequently", "Recently", "Today", "Tomorrow",
  "Yesterday", "Once", "Twice", "Daily", "Weekly", "Monthly", "Yearly",
];

// ── Section headers / note-structure words ──────────────────────────────────
const SECTION_HEADERS = [
  "History", "Present", "Illness", "Chief", "Complaint", "Assessment", "Plan",
  "Diagnosis", "Diagnoses", "Impression", "Subjective", "Objective",
  "Medications", "Medication", "Meds", "Allergies", "Allergy", "Exam",
  "Examination", "Findings", "Finding", "Imaging", "Labs", "Laboratory",
  "Results", "Result", "Vitals", "Review", "Systems", "System", "Social",
  "Family", "Past", "Medical", "Physical", "Neurological", "Neuro",
  "Musculoskeletal", "Cardiovascular", "Respiratory", "Gastrointestinal",
  "Genitourinary", "Constitutional", "Psychiatric", "Skin", "Extremities",
  "Extremity", "Recommendations", "Recommendation", "Discussion", "Summary",
  "Prognosis", "Disposition", "Referral", "Consultation", "Consult",
  "Procedure", "Procedures", "Indication", "Indications", "Technique",
  "Complications", "Signature", "Provider", "Physician", "Attending",
  "Resident", "Nurse", "Clinic", "Office", "Department", "Note", "Notes",
  "Report", "Records", "Record", "Documentation", "Encounter", "Visit",
  "Followup", "Narrative", "Comments", "Comment", "Instructions", "Education",
  "Goals", "Goal", "Status", "Course", "Progress", "Interval", "Onset",
  "Duration", "Frequency", "Severity", "Quality", "Context", "Modifying",
  "Factors", "Associated", "Signs", "Symptoms", "Symptom",
];

// ── Clinical / descriptive terms (superset of CLINICAL_NAME_STOPLIST) ───────
const CLINICAL_TERMS = [
  "Flexion", "Extension", "Rotation", "Abduction", "Adduction", "Limited",
  "Range", "Motion", "Strength", "Tenderness", "Effusion", "Edema", "Sprain",
  "Strain", "Acute", "Chronic", "Severe", "Moderate", "Mild", "Minimal",
  "Marked", "Left", "Right", "Bilateral", "Unilateral", "Upper", "Lower",
  "Anterior", "Posterior", "Medial", "Lateral", "Proximal", "Distal",
  "Superior", "Inferior", "Dorsal", "Ventral", "Central", "Peripheral",
  "Pain", "Painful", "Painless", "Weakness", "Weak", "Numbness", "Tingling",
  "Denied", "Denies", "Approved", "Pending", "Positive", "Negative", "Normal",
  "Abnormal", "Stable", "Unstable", "Intact", "Impaired", "Full", "Partial",
  "Complete", "Incomplete", "Present", "Absent", "Reduced", "Increased",
  "Decreased", "Elevated", "Diminished", "Preserved", "Unremarkable",
  "Remarkable", "Grossly", "Otherwise", "Within", "Limits", "Tender",
  "Swollen", "Swelling", "Warm", "Erythema", "Ecchymosis", "Atrophy",
  "Instability", "Laxity", "Crepitus", "Clicking", "Locking", "Catching",
  "Giving", "Stiffness", "Stiff", "Spasm", "Guarding", "Antalgic", "Gait",
  "Ambulation", "Ambulatory", "Function", "Functional", "Activities", "Daily",
  "Living", "Occupational", "Recreational", "Conservative", "Failed",
  "Refractory", "Persistent", "Progressive", "Recurrent", "Improved",
  "Improving", "Worsened", "Worsening", "Unchanged", "Resolved", "Resolving",
  "Continues", "Continued", "Reports", "Reported", "Complains", "Presents",
  "Presented", "States", "Stated", "Noted", "Notes", "Observed", "Documented",
  "Tolerated", "Underwent", "Received", "Prescribed", "Administered", "Trial",
  "Trials", "Course", "Regimen", "Compliance", "Compliant", "Adherence",
  "Grade", "Level", "Degree", "Degrees", "Score", "Scale", "Rating", "Measure",
  "Measurement", "Range", "Baseline", "Interval", "Repeat", "Serial",
  // months / days (mirror of CLINICAL_NAME_STOPLIST so date words never flag)
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "June", "July", "August",
  "September", "October", "November", "December",
];

// ── Anatomy ─────────────────────────────────────────────────────────────────
const ANATOMY = [
  "Knee", "Shoulder", "Hip", "Ankle", "Elbow", "Wrist", "Hand", "Fingers",
  "Finger", "Thumb", "Foot", "Feet", "Toe", "Toes", "Spine", "Neck", "Back",
  "Cervical", "Lumbar", "Thoracic", "Sacral", "Sacrum", "Coccyx", "Pelvis",
  "Pelvic", "Femur", "Femoral", "Tibia", "Tibial", "Fibula", "Fibular",
  "Patella", "Patellar", "Humerus", "Humeral", "Radius", "Radial", "Ulna",
  "Ulnar", "Clavicle", "Clavicular", "Scapula", "Scapular", "Rotator", "Cuff",
  "Meniscus", "Meniscal", "Ligament", "Ligamentous", "Tendon", "Tendinous",
  "Cartilage", "Bursa", "Bursal", "Supraspinatus", "Infraspinatus",
  "Subscapularis", "Teres", "Deltoid", "Biceps", "Triceps", "Quadriceps",
  "Hamstring", "Hamstrings", "Gastrocnemius", "Soleus", "Achilles", "Labrum",
  "Labral", "Glenoid", "Glenohumeral", "Acromion", "Acromial", "Acromioclavicular",
  "Trochanter", "Trochanteric", "Condyle", "Condylar", "Epicondyle",
  "Malleolus", "Calcaneus", "Talus", "Metatarsal", "Metacarpal", "Phalanx",
  "Phalangeal", "Carpal", "Tarsal", "Vertebra", "Vertebral", "Disc", "Disk",
  "Joint", "Muscle", "Muscular", "Nerve", "Nerves", "Bone", "Bones", "Osseous",
  "Cortex", "Cortical", "Marrow", "Synovial", "Synovium", "Capsule", "Capsular",
];

// ── Conditions / pathology ──────────────────────────────────────────────────
const CONDITIONS = [
  "Osteoarthritis", "Arthritis", "Arthritic", "Osteoarthritic", "Tendinitis",
  "Tendonitis", "Tendinosis", "Tendinopathy", "Bursitis", "Synovitis",
  "Capsulitis", "Tear", "Torn", "Rupture", "Ruptured", "Sprain", "Strain",
  "Fracture", "Fractured", "Dislocation", "Dislocated", "Subluxation",
  "Impingement", "Stenosis", "Herniation", "Herniated", "Radiculopathy",
  "Neuropathy", "Myelopathy", "Effusion", "Edema", "Inflammation",
  "Inflammatory", "Degeneration", "Degenerative", "Osteophyte", "Osteophytes",
  "Spondylosis", "Spondylolisthesis", "Spondylitis", "Scoliosis", "Kyphosis",
  "Lordosis", "Contracture", "Adhesive", "Frozen", "Necrosis", "Avascular",
  "Osteonecrosis", "Chondromalacia", "Chondral", "Osteochondral", "Loose",
  "Body", "Bodies", "Cyst", "Cystic", "Ganglion", "Nodule", "Lesion", "Defect",
  "Deformity", "Malalignment", "Varus", "Valgus", "Genu", "Hallux", "Bunion",
];

// ── Imaging / studies ───────────────────────────────────────────────────────
const IMAGING = [
  "Radiograph", "Radiographs", "Radiographic", "Ultrasound", "Sonography",
  "Fluoroscopy", "Arthrogram", "Myelogram", "Scan", "Scans", "Films", "Film",
  "Views", "View", "Weightbearing", "Standing", "Contrast", "Enhancement",
];

// ── Treatments / interventions ──────────────────────────────────────────────
const TREATMENTS = [
  "Physical", "Occupational", "Therapy", "Therapies", "Rehabilitation",
  "Rehab", "Injection", "Injections", "Cortisone", "Steroid", "Steroids",
  "Corticosteroid", "Corticosteroids", "Viscosupplementation", "Hyaluronic",
  "Ice", "Heat", "Rest", "Activity", "Modification", "Bracing", "Brace",
  "Splint", "Splinting", "Orthotic", "Orthotics", "Immobilization", "Sling",
  "Crutches", "Cane", "Surgery", "Surgical", "Operative",
  "Nonoperative", "Arthroscopy", "Arthroscopic", "Arthroplasty", "Replacement",
  "Repair", "Reconstruction", "Debridement", "Decompression", "Fusion",
  "Fixation", "Osteotomy", "Meniscectomy", "Laminectomy", "Discectomy",
  "Microfracture", "Acupuncture", "Chiropractic", "Manipulation", "Modalities",
  "Ultrasound", "Stimulation", "Traction", "Aspiration", "Aquatherapy",
  "Anesthesia", "Anesthetic", "Sedation", "Preoperative", "Postoperative",
  "Perioperative", "Prophylaxis",
];

// ── Common medications (generic + brand; MUST include the fixture drugs) ────
const DRUGS = [
  // generic
  "Ibuprofen", "Naproxen", "Meloxicam", "Diclofenac", "Celecoxib", "Ketorolac",
  "Indomethacin", "Etodolac", "Acetaminophen", "Tramadol", "Oxycodone",
  "Hydrocodone", "Codeine", "Morphine", "Gabapentin", "Pregabalin", "Duloxetine",
  "Amitriptyline", "Nortriptyline", "Cyclobenzaprine", "Tizanidine",
  "Methocarbamol", "Baclofen", "Prednisone", "Prednisolone", "Methylprednisolone",
  "Triamcinolone", "Betamethasone", "Dexamethasone", "Cortisone", "Hydrocortisone",
  "Lidocaine", "Bupivacaine", "Ropivacaine", "Metformin", "Glipizide",
  "Glimepiride", "Lisinopril", "Enalapril", "Ramipril", "Atorvastatin",
  "Rosuvastatin", "Simvastatin", "Pravastatin", "Amlodipine", "Metoprolol",
  "Atenolol", "Carvedilol", "Losartan", "Valsartan", "Hydrochlorothiazide",
  "Furosemide", "Aspirin", "Omeprazole", "Pantoprazole", "Ranitidine",
  "Famotidine", "Levothyroxine", "Insulin", "Warfarin", "Apixaban",
  "Rivaroxaban", "Clopidogrel", "Sertraline", "Escitalopram", "Citalopram",
  "Fluoxetine", "Paroxetine", "Venlafaxine", "Bupropion", "Trazodone",
  "Alprazolam", "Lorazepam", "Clonazepam", "Albuterol", "Montelukast",
  "Fluticasone", "Tamsulosin", "Allopurinol", "Colchicine", "Vitamin", "Calcium",
  // brand
  "Kenalog", "Toradol", "Celebrex", "Mobic", "Aleve", "Advil", "Tylenol",
  "Motrin", "Norco", "Percocet", "Vicodin", "Ultram", "Neurontin", "Lyrica",
  "Cymbalta", "Flexeril", "Zanaflex", "Voltaren", "Lipitor", "Crestor", "Zocor",
  "Norvasc", "Lopressor", "Cozaar", "Glucophage", "Prinivil", "Zestril",
  "Synthroid", "Coumadin", "Eliquis", "Xarelto", "Plavix", "Zoloft", "Lexapro",
  "Prozac", "Paxil", "Effexor", "Wellbutrin", "Xanax", "Ativan", "Klonopin",
  "Ventolin", "Proventil", "Singulair", "Flonase", "Flomax", "Zyloprim",
  "Depo", "Medrol", "Solu",
];

// ── Orthopedic device / implant manufacturers + product lines ───────────────
// NOTE: common-surname device brands ("Smith", "Wright", "Zimmer", "Stryker")
// and the place-name/surname product line ("Oxford", as in the Oxford Partial
// Knee) are intentionally OMITTED from the single-token list -- allowlisting
// them would let a real name like "Will Smith" or a patient/contact surnamed
// Zimmer, Stryker, or Oxford pass the every-token rule. They survive only via
// the multi-word brand phrases below ("Smith Nephew", "Wright Medical",
// "Zimmer NexGen", "Stryker Triathlon"); a bare standalone mention of one of
// these brand names with no accompanying product line gets masked, which is
// the accepted, safer failure mode.
const DEVICE_BRANDS_SINGLE = [
  "Biomet", "DePuy", "Synthes", "Arthrex",
  "Nephew", "Exactech", "Conmed", "ConMed", "Medtronic", "Nuvasive",
  "NuVasive", "Globus", "Integra", "Corin", "Microport", "MicroPort", "Aesculap",
  // product lines
  "NexGen", "Persona", "Attune", "Triathlon", "Journey", "Vanguard",
  "Sigma", "Genesis", "Legion", "Optetrak", "Sigma", "Gemini", "Comprehensive",
  "Continuum", "Trident", "Accolade", "Corail", "Pinnacle", "Taperloc",
];
// Multi-word device units allowlisted as WHOLE PHRASES (so a 2-token match
// passes as a unit even though each token is also listed above).
const DEVICE_BRANDS_MULTI = [
  "Zimmer NexGen", "Zimmer Biomet", "Zimmer Persona", "Smith Nephew",
  "DePuy Synthes", "Stryker Triathlon", "Smith And Nephew", "Wright Medical",
];

// ── Hyphenated clinical compounds (Gap 1 -- seeded now, not discovered) ─────
// The residual pass's multi-word / internal-hyphen branch would otherwise flag
// standard ortho phrasing. Listed as whole phrases (hyphens normalized to the
// literal form the detector emits).
const HYPHENATED_COMPOUNDS = [
  "Post-Op", "Pre-Op", "Non-Op", "Peri-Op", "Post-Operative", "Pre-Operative",
  "Non-Operative", "Non-Surgical", "Non-Weight-Bearing", "Weight-Bearing",
  "Full-Weight-Bearing", "Partial-Weight-Bearing", "Toe-Touch", "X-Ray",
  "X-Rays", "Well-Healed", "Well-Nourished", "Well-Developed", "Well-Appearing",
  "T-Score", "Z-Score", "Range-Of-Motion", "Follow-Up", "Full-Thickness",
  "Partial-Thickness", "Long-Term", "Short-Term", "In-Office", "Out-Patient",
  "In-Patient", "Left-Sided", "Right-Sided", "Anti-Inflammatory", "First-Line",
  "Second-Line", "Third-Line", "End-Stage", "Age-Related", "Bone-On-Bone",
  "Two-Week", "Four-Week", "Six-Week", "Eight-Week", "Twelve-Week", "Self-Care",
  "Co-Morbidity", "Co-Morbidities", "Work-Up", "Low-Impact", "High-Impact",
  "Weight-Loss", "Non-Displaced", "Well-Aligned", "Non-Tender",
];

// ── Multi-word clinical phrases (whole-phrase entries) ──────────────────────
// The residual pass flags a 2+ Titlecase-word run unless the WHOLE phrase is
// allowlisted. Clinical bigrams are common enough (section headers, laterality
// + joint, treatment names) that they must be seeded as phrases or every letter
// fills with [REDACTED]. This list is the primary punch-list to grow during
// fixture iteration.
const LATERALITY = ["Left", "Right", "Bilateral"];
const JOINTS = [
  "Shoulder", "Knee", "Hip", "Ankle", "Elbow", "Wrist", "Hand", "Foot",
  "Spine", "Thumb", "Neck", "Back", "Leg", "Arm",
];
const LATERALITY_JOINT_PHRASES: string[] = LATERALITY.flatMap((side) =>
  JOINTS.map((j) => `${side} ${j}`)
);

const CLINICAL_PHRASES = [
  // section headers
  "Chief Complaint", "Present Illness", "History Of", "Past Medical",
  "Medical History", "Family History", "Social History", "Surgical History",
  "Review Of", "Of Systems", "Physical Exam", "Physical Examination",
  "Assessment And", "And Plan", "Plan Of", "Of Care", "Vital Signs",
  "Blood Pressure", "Heart Rate", "Respiratory Rate", "Prior Authorization",
  "Medical Necessity", "Date Of", "Of Birth", "Of Service", "Of Injury",
  // treatments
  "Physical Therapy", "Occupational Therapy", "Cortisone Injection",
  "Steroid Injection", "Corticosteroid Injection", "Conservative Treatment",
  "Conservative Management", "Conservative Care", "Conservative Therapy",
  "Anti Inflammatory", "Total Knee", "Total Hip", "Total Shoulder",
  "Knee Replacement", "Hip Replacement", "Shoulder Replacement",
  "Knee Arthroplasty", "Hip Arthroplasty", "Total Joint", "Joint Replacement",
  "Range Of", "Of Motion", "Range Of Motion", "Weight Bearing", "Non Weight",
  "Follow Up", "Home Exercise", "Exercise Program",
  // anatomy / pathology bigrams
  "Rotator Cuff", "Medial Meniscus", "Lateral Meniscus", "Anterior Cruciate",
  "Posterior Cruciate", "Cruciate Ligament", "Collateral Ligament",
  "Joint Space", "Bone Marrow", "Full Thickness", "Partial Thickness",
  "Loose Body", "Loose Bodies", "Joint Line",
  // exam prose
  "No Acute", "Acute Distress", "Well Nourished", "Well Developed",
  "Well Appearing", "In No", "No Distress", "Alert And", "And Oriented",
  "Grossly Intact", "Within Normal", "Normal Limits",
];

// ── Form / chart labels + admin + payer vocabulary ─────────────────────────
// Charts are full of Titlecase field labels and payer names. None are HIPAA-18
// identifiers, and payer names are needed downstream, so allowlist them.
const ADMIN_LABELS = [
  "Patient", "Name", "Date", "Birth", "Form", "Evaluation", "Chart", "Reason",
  "Requested", "Requesting", "Ordering", "Referring", "Referred", "Referral",
  "Treating", "Rendering",
  "Surgeon", "Surgeons", "Attending", "Consulting", "Presenting", "Complaint",
  "Classification", "Statement", "Necessity", "Measurements", "Measurement",
  "Limitations", "Limitation", "Attempted", "Outcome", "Outcomes", "Structural",
  "Internal", "External", "Focused", "Practice", "Group", "Insurance",
  "Insurer", "Payer", "Payor", "Policy", "Member", "Subscriber", "Coverage",
  "Claim", "Claims", "Authorization", "Reference", "Employer", "Employment",
  "Occupation", "Occupational", "Employed", "Retired", "Disability", "Works",
  "Working", "Active", "Inactive", "Primary", "Secondary", "Tertiary",
  "Notable", "Significant", "Pertinent", "Relevant", "Cannot", "Unable",
  "Less", "General", "Specific", "Overall", "Type", "Class", "Stage", "Score",
  "Grade", "Level", "Category", "Section", "Value", "Total", "Subtotal",
  "Treatments", "Treatment", "Intervention", "Interventions", "Modality",
  "Modalities", "Difficulty", "Difficulties", "Disturbed", "Disturbance",
  "Ambulates", "Ambulate", "Walks", "Stands", "Sits", "Climbs", "Lifts",
  "Carries", "Reaches", "Bends", "Kneels", "Squats", "Grips", "Grasps",
  "Lifting", "Carrying", "Reaching", "Bending", "Kneeling", "Squatting",
  "Climbing", "Walking", "Standing", "Sitting", "Sleeping", "Dressing",
  "Bathing", "Driving", "Household", "Chores", "Stairs",
];

// Common medical shorthand that happens to be Titlecase-shaped.
const MED_ABBREV = ["Dx", "Pt", "Rx", "Hx", "Sx", "Tx", "Fx", "Bx", "Ds", "Cc"];

// Eponymous exam maneuvers / grading scales. IMPORTANT: an eponym IS, by
// definition, a real historical person's actual surname (that's what makes it
// an eponym) -- so bare single-token entries here are not "name-shaped
// clinical terms that happen to resemble a name," they are literally real
// surnames (Kellgren, Lawrence, Harris, Thomas, Thompson, Wells, Hawkins,
// McMurray, etc. were real physicians). A patient or contact who shares one of
// these surnames and appears as an unlabeled bare token would have been
// silently allowlisted. Only the ALREADY-HYPHENATED compound forms are kept
// bare (clinicians write these as one hyphenated unit, e.g. "Kellgren-Lawrence
// grade 2", so the compound is what actually needs to survive), plus two
// non-name terms that are not eponyms at all: "Womac" (a study-name acronym,
// WOMAC, not a person) and "Drawer" (the exam maneuver is literally a drawer
// motion, an ordinary English noun). Standalone usage of every other eponym is
// covered instead by explicit canonical PHRASE forms below (EPONYM_PHRASES),
// which require the surname AND its accompanying clinical word (Test/Sign/
// Score/Classification/etc.) to appear together -- an unusual phrasing that
// drops the clinical word still gets masked, which is the accepted, safer
// failure mode.
const EPONYMS = ["Kellgren-Lawrence", "Hawkins-Kennedy", "Salter-Harris", "Gustilo-Anderson", "Womac", "Drawer"];

const EPONYM_PHRASES = [
  "Kellgren Lawrence", "Hawkins Kennedy", "Salter Harris", "Gustilo Anderson",
  "McMurray Test", "McMurray Sign",
  "Neer Test", "Neer Sign", "Neer Impingement",
  "Hawkins Test", "Hawkins Sign", "Hawkins Impingement",
  "Spurling Test", "Spurling Sign",
  "Tinel Sign", "Tinel Test",
  "Phalen Test", "Phalen Sign", "Phalen Maneuver",
  "Wells Score", "Wells Criteria",
  "Outerbridge Classification", "Outerbridge Grade",
  "Tonnis Grade", "Tonnis Classification",
  "Ficat Classification", "Ficat Stage",
  "Garden Classification", "Garden Grade",
  "Charnley Classification", "Charnley Class", "Charnley Score",
  "Harris Hip", "Modified Harris",
  "Constant Score", "Constant Murley",
  "Apley Test", "Apley Grind", "Apley Compression", "Apley Distraction",
  "Ober Test",
  "Thomas Test",
  "Speed Test",
  "Yergason Test",
  "Finkelstein Test",
  "Froment Sign", "Froment Test",
  "Homan Sign", "Homans Sign",
  "Thompson Test",
  "Trendelenburg Test", "Trendelenburg Sign", "Trendelenburg Gait",
  "Lachman Test",
];

// Payer / insurer names (not HIPAA identifiers; needed for the appeal letter).
// NOTE: bare "Cross" and "Shield" are intentionally OMITTED -- both are real
// surnames (e.g. "David Cross"), and neither is needed standalone: legitimate
// usage is always "Blue Cross" / "Blue Shield", already covered as whole
// phrases in PAYER_PHRASES below (whole-phrase matching doesn't require the
// individual tokens to be separately allowlisted).
const PAYERS = [
  "Aetna", "Cigna", "Humana", "Anthem", "Kaiser", "Medicare", "Medicaid",
  "Tricare", "Optum", "Wellcare", "Centene", "Molina", "Healthcare", "Health",
  "United", "Wellpoint", "Highmark", "Carefirst", "Emblem",
  "Amerigroup", "Oscar", "Bcbs",
];
const PAYER_PHRASES = [
  "Blue Cross", "Blue Shield", "Blue Cross Blue Shield", "United Healthcare",
  "United Health", "Health Net", "Health Plan", "Health Partners",
];

// Viscosupplements / injectables (brand) commonly named in ortho charts.
const INJECTABLES = [
  "Synvisc", "Synvisc-One", "Euflexxa", "Orthovisc", "Supartz", "Gel-One",
  "Hyalgan", "Durolane", "Monovisc", "Hymovis", "Genvisc",
];

// ── Assembly ────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

const ALL_ENTRIES: string[] = [
  ...COMMON_WORDS,
  ...SECTION_HEADERS,
  ...CLINICAL_TERMS,
  ...ANATOMY,
  ...CONDITIONS,
  ...IMAGING,
  ...TREATMENTS,
  ...DRUGS,
  ...DEVICE_BRANDS_SINGLE,
  ...DEVICE_BRANDS_MULTI,
  ...HYPHENATED_COMPOUNDS,
  ...LATERALITY_JOINT_PHRASES,
  ...CLINICAL_PHRASES,
  ...ADMIN_LABELS,
  ...MED_ABBREV,
  ...EPONYMS,
  ...EPONYM_PHRASES,
  ...PAYERS,
  ...PAYER_PHRASES,
  ...INJECTABLES,
];

export const DEID_ALLOWLIST: ReadonlySet<string> = new Set(ALL_ENTRIES.map(norm));

// Case-insensitive, whitespace-normalized membership test. Accepts either a
// single token or a full multi-word phrase; the caller decides granularity.
export function isAllowlisted(phrase: string): boolean {
  return DEID_ALLOWLIST.has(norm(phrase));
}

// The residual-pass keep/mask decision for a name-shaped span, shared by both
// lib/deidentify.ts (redaction) and lib/deid-verify.ts (verification mirror) so
// the KEEP LOGIC lives in exactly one place even though each module keeps its
// own regex. A span is allowlisted when the WHOLE phrase matches (so multi-word
// brand units like "Zimmer NexGen" pass) OR, for a multi-word span, EVERY token
// is individually allowlisted (so "Attending Surgeon" / "X-Ray Left Knee" pass
// without enumerating every phrase permutation). A single-token span must match
// the whole-phrase set. This is a deliberate, reported refinement of a strict
// whole-phrase rule: it still masks "John Smith" (neither token allowlisted)
// while making the allowlist a word list rather than a phrase-combinatorial one.
// Residual false negative: a two-token name whose BOTH tokens are allowlisted
// words -- mitigated by omitting common-surname device brands from the single
// list.
export function isSpanAllowlisted(span: string): boolean {
  if (isAllowlisted(span)) return true;
  const tokens = span.split(/[ \t]+/).filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every((t) => isAllowlisted(t));
}
