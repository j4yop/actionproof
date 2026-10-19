/**
 * Accessibility feedback helpers.
 *
 * Two things a screen reader user must never miss:
 *   1. that a verification started, and how it ended;
 *   2. where the input is invalid, with a way to jump straight to it.
 *
 * These builders are pure so the rules are testable without a browser.
 */

export interface ApiIssue {
  path?: Array<string | number>;
  message: string;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  issues?: ApiIssue[];
  field?: "contract" | "evidence";
}

export interface ErrorSummaryEntry {
  field: "contract" | "evidence" | "payload";
  label: string;
  message: string;
  issueCount: number;
}

export type Announcement =
  | { kind: "started" }
  | { kind: "completed"; status: string }
  | { kind: "failed"; message: string };

const FIELD_LABELS: Record<"contract" | "evidence", string> = {
  contract: "Contract",
  evidence: "Evidence bundle",
};

export function buildErrorSummary(error: ApiErrorShape): ErrorSummaryEntry[] {
  const entries = new Map<"contract" | "evidence" | "payload", ErrorSummaryEntry>();

  const ensure = (field: "contract" | "evidence" | "payload"): ErrorSummaryEntry => {
    const existing = entries.get(field);
    if (existing) return existing;
    const created: ErrorSummaryEntry = {
      field,
      label: field === "payload" ? "Input" : FIELD_LABELS[field],
      message: error.message,
      issueCount: 0,
    };
    entries.set(field, created);
    return created;
  };

  for (const issue of error.issues ?? []) {
    const head = issue.path?.[0];
    const field = head === "contract" ? "contract" : head === "evidence" ? "evidence" : error.field ?? "payload";
    const entry = ensure(field);
    entry.issueCount += 1;
  }

  if (entries.size === 0 && error.field) {
    const entry = ensure(error.field);
    entry.issueCount = 1;
  }

  return [...entries.values()];
}

export function buildAnnouncement(announcement: Announcement): string {
  if (announcement.kind === "started") {
    return "Verification started. The verifier is replaying the contract against the submitted evidence.";
  }
  if (announcement.kind === "completed") {
    return `Verification completed. Verdict: ${announcement.status.replaceAll("_", " ")}.`;
  }
  return `Verification failed. ${announcement.message}`;
}

/** Editor element ids used by the focus targets in the console. */
export const EDITOR_IDS = {
  contract: "contract",
  evidence: "evidence-bundle",
} as const;
