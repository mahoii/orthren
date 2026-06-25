import type { ExtractedChartData } from "@/lib/types";

type FixtureField =
  | { exact: string; description?: string }
  | { must_include: string[]; description?: string }
  | { contains_ci: string; description?: string }
  | { present: boolean; modality_contains_ci?: string; description?: string }
  | { min_count: number; description?: string }
  | { score: 0 | 1 };

export type FixtureSpec = {
  _meta: { chart: string; patient: string; scenario: string };
  patient_name?: { exact: string; description?: string };
  date_of_birth?: { exact: string };
  diagnosis_codes?: { must_include: string[]; description?: string };
  requested_procedure?: { contains_ci: string; description?: string };
  conservative_treatments_attempted?: { min_count: number; description?: string };
  imaging_findings?: { present: boolean; modality_contains_ci?: string; description?: string };
  functional_limitations?: { min_count: number };
  pa_strength?: Partial<Record<string, { score: 0 | 1 }>>;
};

export type ComparisonResult = {
  field: string;
  status: "pass" | "fail";
  expected: string;
  actual: string;
  description?: string;
};

export function compareExtractionToFixture(
  extraction: ExtractedChartData & { validation?: any },
  fixture: FixtureSpec
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  if (fixture.patient_name) {
    const actual = extraction.patient_name ?? "(null)";
    const pass = actual === fixture.patient_name.exact;
    results.push({
      field: "patient_name",
      status: pass ? "pass" : "fail",
      expected: fixture.patient_name.exact,
      actual,
      description: fixture.patient_name.description,
    });
  }

  if (fixture.date_of_birth) {
    const actual = extraction.date_of_birth ?? "(null)";
    results.push({
      field: "date_of_birth",
      status: actual === fixture.date_of_birth.exact ? "pass" : "fail",
      expected: fixture.date_of_birth.exact,
      actual,
    });
  }

  if (fixture.diagnosis_codes) {
    const codes = extraction.diagnosis_codes ?? [];
    const missing = fixture.diagnosis_codes.must_include.filter((c) => !codes.includes(c));
    results.push({
      field: "diagnosis_codes",
      status: missing.length === 0 ? "pass" : "fail",
      expected: `includes [${fixture.diagnosis_codes.must_include.join(", ")}]`,
      actual: codes.join(", ") || "(empty)",
      description: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined,
    });
  }

  if (fixture.requested_procedure) {
    const actual = extraction.requested_procedure ?? "(null)";
    const pass = actual.toLowerCase().includes(fixture.requested_procedure.contains_ci.toLowerCase());
    results.push({
      field: "requested_procedure",
      status: pass ? "pass" : "fail",
      expected: `contains "${fixture.requested_procedure.contains_ci}"`,
      actual,
      description: fixture.requested_procedure.description,
    });
  }

  if (fixture.conservative_treatments_attempted) {
    const count = extraction.conservative_treatments_attempted?.length ?? 0;
    const min = fixture.conservative_treatments_attempted.min_count;
    results.push({
      field: "conservative_treatments_attempted",
      status: count >= min ? "pass" : "fail",
      expected: `>= ${min} entries`,
      actual: `${count} entries`,
      description: fixture.conservative_treatments_attempted.description,
    });
  }

  if (fixture.imaging_findings) {
    const imaging = extraction.imaging_findings;
    const isPresent = imaging !== null && imaging !== undefined;
    if (fixture.imaging_findings.present) {
      const passPresent = isPresent;
      let passModality = true;
      if (fixture.imaging_findings.modality_contains_ci && imaging?.modality) {
        passModality = imaging.modality
          .toLowerCase()
          .includes(fixture.imaging_findings.modality_contains_ci.toLowerCase());
      }
      results.push({
        field: "imaging_findings",
        status: passPresent && passModality ? "pass" : "fail",
        expected: fixture.imaging_findings.modality_contains_ci
          ? `present with modality containing "${fixture.imaging_findings.modality_contains_ci}"`
          : "present",
        actual: isPresent ? `modality="${imaging?.modality ?? "(none)"}"` : "(null)",
        description: fixture.imaging_findings.description,
      });
    } else {
      results.push({
        field: "imaging_findings",
        status: !isPresent ? "pass" : "fail",
        expected: "null (not present)",
        actual: isPresent ? `modality="${imaging?.modality}"` : "(null)",
      });
    }
  }

  if (fixture.functional_limitations) {
    const count = extraction.functional_limitations?.length ?? 0;
    const min = fixture.functional_limitations.min_count;
    results.push({
      field: "functional_limitations",
      status: count >= min ? "pass" : "fail",
      expected: `>= ${min} entries`,
      actual: `${count} entries`,
    });
  }

  if (fixture.pa_strength && extraction.pa_strength) {
    for (const [factor, spec] of Object.entries(fixture.pa_strength)) {
      if (!spec) continue;
      const factorData = (extraction.pa_strength as any)[factor];
      const actualScore = factorData?.score ?? "(missing)";
      results.push({
        field: `pa_strength.${factor}`,
        status: actualScore === spec.score ? "pass" : "fail",
        expected: `score=${spec.score}`,
        actual: `score=${actualScore}`,
      });
    }
  }

  return results;
}

export function summarizeComparison(results: ComparisonResult[]): {
  passed: number;
  failed: number;
  failures: ComparisonResult[];
} {
  const failures = results.filter((r) => r.status === "fail");
  return {
    passed: results.length - failures.length,
    failed: failures.length,
    failures,
  };
}
