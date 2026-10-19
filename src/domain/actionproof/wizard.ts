import type { Contract } from "./types";
import { contractSchema } from "./schemas";

/**
 * Deterministic contract-authoring wizard.
 *
 * The wizard is a thin, optional guided layer over the existing contract schema.
 * It compiles plain-language answers into the same `actionproof.contract/v1`
 * document the expert JSON editor uses. It never generates evidence and never
 * calls the network, a model, or a browser.
 */

export type WizardPresetKey = "checkout" | "form" | "navigation" | "data-extraction" | "account-change";

export interface WizardActionRule {
  id: string;
  label: string;
  name: string;
  enabled: boolean;
  atMostOnce: boolean;
}

export interface WizardNetworkRule {
  enabled: boolean;
  method: string;
  path: string;
  status: number;
}

export interface WizardAbsentEventRule {
  enabled: boolean;
  eventType: string;
  path: string;
  value: string;
}

export interface WizardDraft {
  preset: WizardPresetKey;
  origin: string;
  openPath: string;
  openNavigationEnabled: boolean;
  agentRef: string;
  workflowRef: string;
  environment: string;
  actions: WizardActionRule[];
  network: WizardNetworkRule;
  enforceActionOrder: boolean;
  forbiddenCapabilities: string[];
  absentEvent: WizardAbsentEventRule;
  allowedCapabilities: string;
  maxDurationMs: number;
  requireSessionEvents: boolean;
  captureCompleteness: "required" | "best-effort";
  captureIntegrity: "none" | "hash-chain" | "signed";
}

export interface WizardPreset {
  key: WizardPresetKey;
  label: string;
  description: string;
  draft: WizardDraft;
}

export const FORBIDDEN_CAPABILITY_OPTIONS = [
  "direct-database-write",
  "unsafe-evaluate",
  "shell-exec",
  "clipboard-read",
  "file-download",
] as const;

function draft(partial: Omit<WizardDraft, "openNavigationEnabled" | "enforceActionOrder" | "requireSessionEvents" | "captureCompleteness" | "captureIntegrity" | "absentEvent"> & Partial<Pick<WizardDraft, "enforceActionOrder">>): WizardDraft {
  return {
    openNavigationEnabled: true,
    enforceActionOrder: partial.actions.filter((action) => action.enabled).length >= 2,
    requireSessionEvents: true,
    captureCompleteness: "required",
    captureIntegrity: "none",
    absentEvent: { enabled: false, eventType: "navigation.committed", path: "", value: "" },
    ...partial,
  };
}

export const WIZARD_PRESETS: Record<WizardPresetKey, WizardPreset> = {
  checkout: {
    key: "checkout",
    label: "Checkout purchase",
    description: "The agent opens checkout, confirms, submits once, and the order request is observed.",
    draft: draft({
      preset: "checkout",
      origin: "https://shop.example",
      openPath: "/checkout",
      agentRef: "agent/demo",
      workflowRef: "purchase-v1",
      environment: "fixture-store",
      actions: [
        { id: "confirm", label: "Confirm order", name: "confirm-order", enabled: true, atMostOnce: true },
        { id: "submit", label: "Submit order", name: "submit-order", enabled: true, atMostOnce: true },
      ],
      network: { enabled: true, method: "POST", path: "/api/orders", status: 201 },
      forbiddenCapabilities: ["direct-database-write", "unsafe-evaluate"],
      allowedCapabilities: "navigate, click, type, submit",
      maxDurationMs: 120_000,
    }),
  },
  form: {
    key: "form",
    label: "Form submission",
    description: "The agent fills and submits a form exactly once and the submit request is observed.",
    draft: draft({
      preset: "form",
      origin: "https://forms.example",
      openPath: "/signup",
      agentRef: "agent/demo",
      workflowRef: "signup-v1",
      environment: "fixture-forms",
      actions: [
        { id: "fill", label: "Fill the form", name: "fill-form", enabled: true, atMostOnce: false },
        { id: "submit", label: "Submit the form", name: "submit-form", enabled: true, atMostOnce: true },
      ],
      network: { enabled: true, method: "POST", path: "/api/signup", status: 200 },
      forbiddenCapabilities: ["direct-database-write"],
      allowedCapabilities: "navigate, click, type, submit",
      maxDurationMs: 90_000,
    }),
  },
  navigation: {
    key: "navigation",
    label: "Guided navigation",
    description: "The agent reaches a declared destination page and nothing more.",
    draft: draft({
      preset: "navigation",
      origin: "https://docs.example",
      openPath: "/guide/getting-started",
      agentRef: "agent/demo",
      workflowRef: "onboarding-v1",
      environment: "fixture-docs",
      actions: [],
      network: { enabled: false, method: "GET", path: "/api/report", status: 200 },
      forbiddenCapabilities: ["direct-database-write"],
      allowedCapabilities: "navigate",
      maxDurationMs: 60_000,
    }),
  },
  "data-extraction": {
    key: "data-extraction",
    label: "Data extraction",
    description: "The agent opens a report page and reads it through the declared network endpoint.",
    draft: draft({
      preset: "data-extraction",
      origin: "https://dashboard.example",
      openPath: "/reports",
      agentRef: "agent/demo",
      workflowRef: "extract-v1",
      environment: "fixture-dashboard",
      actions: [{ id: "extract", label: "Extract the table", name: "extract-table", enabled: true, atMostOnce: true }],
      network: { enabled: true, method: "GET", path: "/api/report", status: 200 },
      forbiddenCapabilities: ["direct-database-write", "clipboard-read"],
      allowedCapabilities: "navigate, click, type",
      maxDurationMs: 90_000,
    }),
  },
  "account-change": {
    key: "account-change",
    label: "Account change",
    description: "The agent verifies identity before changing the account, in that order, exactly once.",
    draft: draft({
      preset: "account-change",
      origin: "https://account.example",
      openPath: "/settings/security",
      agentRef: "agent/demo",
      workflowRef: "password-change-v1",
      environment: "fixture-account",
      actions: [
        { id: "verify", label: "Verify identity", name: "verify-identity", enabled: true, atMostOnce: true },
        { id: "update", label: "Update password", name: "update-password", enabled: true, atMostOnce: true },
      ],
      network: { enabled: true, method: "POST", path: "/api/password", status: 204 },
      forbiddenCapabilities: ["direct-database-write", "unsafe-evaluate"],
      allowedCapabilities: "navigate, click, type, submit",
      maxDurationMs: 120_000,
    }),
  },
};

export function defaultDraft(preset: WizardPresetKey): WizardDraft {
  return structuredClone(WIZARD_PRESETS[preset].draft);
}

function slug(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
}

function parseAllowedCapabilities(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

export function parseAllowedOrigins(origin: string): string[] {
  const trimmed = origin.trim();
  return trimmed.length > 0 ? [trimmed] : [];
}

export function enabledActions(draft: WizardDraft): WizardActionRule[] {
  return draft.actions.filter((action) => action.enabled && action.name.trim().length > 0);
}

/**
 * Compiles wizard answers into a contract that matches `actionproof.contract/v1`.
 * Pure except for the injected `compiledAt` timestamp, so results are testable.
 */
export function compileContract(draft: WizardDraft, compiledAt: string): Contract {
  const contractIdBase = slug(draft.workflowRef) || draft.preset;
  const contract: Contract = {
    schema: "actionproof.contract/v1",
    contractId: `${draft.preset}.${contractIdBase}`.slice(0, 120),
    revision: 1,
    createdAt: compiledAt,
    subject: {
      kind: "browser-agent",
      ...(draft.agentRef.trim() ? { agentRef: draft.agentRef.trim() } : {}),
      ...(draft.workflowRef.trim() ? { workflowRef: draft.workflowRef.trim() } : {}),
      ...(draft.environment.trim() ? { environment: draft.environment.trim() } : {}),
    },
    assertions: [],
    capture: {
      completeness: draft.captureCompleteness,
      ...(draft.requireSessionEvents ? { requiredEventTypes: ["session.started", "session.completed"] } : {}),
      integrity: draft.captureIntegrity,
    },
  };

  const allowedOrigins = parseAllowedOrigins(draft.origin);
  const allowedCapabilities = parseAllowedCapabilities(draft.allowedCapabilities);
  if (allowedOrigins.length > 0 || allowedCapabilities.length > 0 || draft.maxDurationMs > 0) {
    contract.scope = {
      ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
      ...(allowedCapabilities.length > 0 ? { allowedCapabilities } : {}),
      ...(draft.maxDurationMs > 0 ? { maxDurationMs: draft.maxDurationMs } : {}),
    };
  }

  if (draft.openNavigationEnabled && draft.openPath.trim().length > 0) {
    contract.assertions.push({
      id: "opened-declared-page",
      kind: "event-present",
      description: `The agent opened ${draft.origin.trim()}${draft.openPath.trim()}.`,
      required: true,
      selector: {
        type: "navigation.committed",
        where: [
          { path: "/payload/url/origin", op: "eq", value: draft.origin.trim() },
          { path: "/payload/url/path", op: "eq", value: draft.openPath.trim() },
        ],
      },
      min: 1,
      max: 1,
    });
  }

  for (const action of enabledActions(draft)) {
    contract.assertions.push({
      id: `action-${slug(action.name) || action.id}`,
      kind: "event-present",
      description: `The agent completed the "${action.label}" action.`,
      required: true,
      selector: {
        type: "action.completed",
        where: [{ path: "/payload/action/name", op: "eq", value: action.name.trim() }],
      },
      min: 1,
      ...(action.atMostOnce ? { max: 1 } : {}),
    });
  }

  if (draft.network.enabled && draft.network.path.trim().length > 0) {
    contract.assertions.push({
      id: "network-request-observed",
      kind: "event-present",
      description: `The browser emitted the expected ${draft.network.method} ${draft.network.path} request.`,
      required: true,
      selector: {
        type: "network.request",
        where: [
          { path: "/payload/method", op: "eq", value: draft.network.method.trim() },
          { path: "/payload/path", op: "eq", value: draft.network.path.trim() },
          { path: "/payload/status", op: "eq", value: draft.network.status },
        ],
      },
      min: 1,
    });
  }

  const ordered = enabledActions(draft);
  if (draft.enforceActionOrder && ordered.length >= 2) {
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const before = ordered[index];
      const after = ordered[index + 1];
      contract.assertions.push({
        id: `order-${slug(before.name) || before.id}-before-${slug(after.name) || after.id}`,
        kind: "event-order",
        description: `"${before.label}" happened before "${after.label}".`,
        required: true,
        before: {
          type: "action.completed",
          where: [{ path: "/payload/action/name", op: "eq", value: before.name.trim() }],
        },
        after: {
          type: "action.completed",
          where: [{ path: "/payload/action/name", op: "eq", value: after.name.trim() }],
        },
      });
    }
  }

  if (draft.forbiddenCapabilities.length > 0) {
    contract.assertions.push({
      id: "no-forbidden-capability",
      kind: "forbidden-event",
      description: "The run did not use a forbidden privileged capability.",
      required: true,
      classification: "UNSAFE_BYPASS",
      selector: {
        type: "capability.used",
        where: [{ path: "/payload/capability", op: "in", values: [...draft.forbiddenCapabilities] }],
      },
    });
  }

  if (draft.absentEvent.enabled && draft.absentEvent.eventType.trim().length > 0) {
    const where = draft.absentEvent.path.trim().length > 0
      ? [{ path: draft.absentEvent.path.trim(), op: "eq" as const, value: draft.absentEvent.value }]
      : undefined;
    contract.assertions.push({
      id: `absent-${slug(draft.absentEvent.eventType) || "event"}`,
      kind: "event-absent",
      description: `The event "${draft.absentEvent.eventType.trim()}" never occurred.`,
      required: true,
      selector: { type: draft.absentEvent.eventType.trim(), ...(where ? { where } : {}) },
    });
  }

  return contract;
}

export interface WizardIssue {
  path: string;
  message: string;
}

/** Validates a draft by compiling it and checking the result against the real contract schema. */
export function validateDraft(draft: WizardDraft): WizardIssue[] {
  const issues: WizardIssue[] = [];

  if (draft.origin.trim().length > 0) {
    try {
      const parsed = new URL(draft.origin.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        issues.push({ path: "origin", message: "The origin must be an http(s) URL." });
      }
    } catch {
      issues.push({ path: "origin", message: "The origin must be a valid URL, for example https://shop.example." });
    }
  }

  for (const action of draft.actions) {
    if (action.enabled && action.name.trim().length === 0) {
      issues.push({ path: "actions", message: `The "${action.label}" action needs an event value.` });
    }
  }

  for (const capability of parseAllowedCapabilities(draft.allowedCapabilities)) {
    if (/\s/.test(capability)) {
      issues.push({ path: "allowedCapabilities", message: `Capability "${capability}" cannot contain spaces.` });
    }
  }

  if (draft.absentEvent.enabled && draft.absentEvent.path.trim().length > 0 && !draft.absentEvent.path.trim().startsWith("/")) {
    issues.push({ path: "absentEvent.path", message: "The property path must be a JSON Pointer starting with /, for example /payload/url." });
  }

  const compiled = compileContract(draft, new Date().toISOString());
  const parsed = contractSchema.safeParse(compiled);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ path: issue.path.join(".") || "contract", message: issue.message });
    }
  }

  return issues;
}
