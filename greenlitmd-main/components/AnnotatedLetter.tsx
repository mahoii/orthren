"use client";

export interface AnnotationItem {
  id: string;
  kind: "fix" | "risk";
  anchor?: string;
  done: boolean;
}

interface Props {
  letter: string;
  items: AnnotationItem[];
  activeIssue: string | null;
  hoverAnchor: string | null;
  onIssueClick: (id: string) => void;
  onHover: (anchor: string | null) => void;
}

function slug(s: string) {
  return s.replace(/[^a-z0-9]/gi, "").slice(0, 24);
}

type Run =
  | { kind: "text"; text: string }
  | { kind: "anchor"; text: string; itemId: string; itemKind: "fix" | "risk"; done: boolean; anchor: string };

function buildRuns(letter: string, items: AnnotationItem[]): Run[] {
  // Collect valid anchors: non-empty, exists in letter (case-sensitive first, then insensitive)
  type AnchorEntry = { anchor: string; pos: number; id: string; kind: "fix" | "risk"; done: boolean };
  const entries: AnchorEntry[] = [];

  for (const item of items) {
    if (!item.anchor) continue;
    const pos = letter.indexOf(item.anchor);
    if (pos === -1) continue;
    entries.push({ anchor: item.anchor, pos, id: item.id, kind: item.kind, done: item.done });
  }

  // Sort by position, then deduplicate overlapping ranges (first-occurrence wins)
  entries.sort((a, b) => a.pos - b.pos);

  const resolved: AnchorEntry[] = [];
  let cursor = 0;
  for (const e of entries) {
    if (e.pos < cursor) continue; // overlaps with a prior anchor — skip
    resolved.push(e);
    cursor = e.pos + e.anchor.length;
  }

  // Build runs
  const runs: Run[] = [];
  let i = 0;
  for (const e of resolved) {
    if (e.pos > i) {
      runs.push({ kind: "text", text: letter.slice(i, e.pos) });
    }
    runs.push({ kind: "anchor", text: e.anchor, itemId: e.id, itemKind: e.kind, done: e.done, anchor: e.anchor });
    i = e.pos + e.anchor.length;
  }
  if (i < letter.length) {
    runs.push({ kind: "text", text: letter.slice(i) });
  }

  return runs;
}

function anchorStyle(run: Extract<Run, { kind: "anchor" }>, activeIssue: string | null, hoverAnchor: string | null): React.CSSProperties {
  const isActive = activeIssue === run.itemId;
  const isHovered = hoverAnchor === run.anchor;

  if (run.done) {
    return {
      borderBottom: "2px solid #16a34a",
      background: isActive ? "rgba(22,163,74,0.14)" : "transparent",
      cursor: "pointer",
      borderRadius: "3px",
      padding: "1px 1px",
      transition: "background 0.15s, box-shadow 0.15s",
    };
  }

  if (run.itemKind === "fix") {
    return {
      borderBottom: "2px dashed #d97706",
      background: isActive ? "rgba(217,119,6,0.20)" : isHovered ? "rgba(217,119,6,0.12)" : "transparent",
      cursor: "pointer",
      borderRadius: "3px",
      padding: "1px 1px",
      transition: "background 0.15s, box-shadow 0.15s",
    };
  }

  return {
    borderBottom: "2px dotted #dc2626",
    background: isActive ? "rgba(220,38,38,0.16)" : isHovered ? "rgba(220,38,38,0.08)" : "transparent",
    cursor: "pointer",
    borderRadius: "3px",
    padding: "1px 1px",
    transition: "background 0.15s, box-shadow 0.15s",
  };
}

export default function AnnotatedLetter({ letter, items, activeIssue, hoverAnchor, onIssueClick, onHover }: Props) {
  const runs = buildRuns(letter, items);

  return (
    <>
      {runs.map((run, i) => {
        if (run.kind === "text") {
          return (
            <span key={i} style={{ whiteSpace: "pre-wrap" }}>
              {run.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            id={"anno-" + slug(run.anchor)}
            style={anchorStyle(run, activeIssue, hoverAnchor)}
            onClick={() => onIssueClick(run.itemId)}
            onMouseEnter={() => onHover(run.anchor)}
            onMouseLeave={() => onHover(null)}
          >
            {run.text}
          </span>
        );
      })}
    </>
  );
}
