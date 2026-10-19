"use client";

import { useMemo, useState } from "react";
import {
  compileContract,
  defaultDraft,
  enabledActions,
  FORBIDDEN_CAPABILITY_OPTIONS,
  validateDraft,
  WIZARD_PRESETS,
  type WizardDraft,
  type WizardPresetKey,
} from "@/domain/actionproof/wizard";

const STEPS = [
  { id: "goal", title: "Goal" },
  { id: "must", title: "Must happen" },
  { id: "must-not", title: "Must not happen" },
  { id: "boundaries", title: "Boundaries" },
  { id: "review", title: "Review" },
] as const;

interface ContractWizardProps {
  disabled: boolean;
  onLoad: (contractJson: string) => void;
}

export function ContractWizard({ disabled, onLoad }: ContractWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(() => defaultDraft("checkout"));
  const [editedJson, setEditedJson] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const issues = useMemo(() => validateDraft(draft), [draft]);
  const generatedJson = useMemo(() => JSON.stringify(compileContract(draft, new Date().toISOString()), null, 2), [draft]);
  const activeJson = editedJson ?? generatedJson;

  const jsonValidity = useMemo(() => {
    if (editedJson === null) return { valid: true, message: "" };
    try {
      const parsed = JSON.parse(editedJson) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { valid: false, message: "The contract draft must be a JSON object." };
      }
      return { valid: true, message: "" };
    } catch {
      return { valid: false, message: "The contract draft contains invalid JSON." };
    }
  }, [editedJson]);

  const canLoad = jsonValidity.valid && (editedJson !== null || issues.length === 0);
  const currentIssueCount = issues.length;

  function update(changes: Partial<WizardDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setEditedJson(null);
    setLoaded(false);
  }

  function choosePreset(preset: WizardPresetKey) {
    setDraft(defaultDraft(preset));
    setEditedJson(null);
    setLoaded(false);
  }

  function loadIntoWorkbench() {
    if (!canLoad || disabled) return;
    onLoad(activeJson);
    setLoaded(true);
  }

  const stepIndex = step;
  const isReview = stepIndex === STEPS.length - 1;

  return (
    <section className="wizard" aria-label="Guided contract wizard">
      <ol className="wizard-progress" aria-label="Wizard progress">
        {STEPS.map((entry, index) => (
          <li key={entry.id} className={index === stepIndex ? "is-current" : index < stepIndex ? "is-done" : ""}>
            <button type="button" onClick={() => setStep(index)} disabled={disabled} aria-current={index === stepIndex ? "step" : undefined}>
              <span className="wizard-progress-index">{index < stepIndex ? "✓" : index + 1}</span>
              {entry.title}
            </button>
          </li>
        ))}
      </ol>

      {stepIndex === 0 && (
        <fieldset className="wizard-step" disabled={disabled}>
          <legend>What should the agent do?</legend>
          <p className="wizard-hint">Pick the closest goal. You can adjust every detail in the next steps.</p>
          <div className="preset-cards" role="radiogroup" aria-label="Scenario goal">
            {Object.values(WIZARD_PRESETS).map((preset) => (
              <label key={preset.key} className={`preset-card ${draft.preset === preset.key ? "is-active" : ""}`}>
                <input
                  type="radio"
                  name="wizard-preset"
                  value={preset.key}
                  checked={draft.preset === preset.key}
                  onChange={() => choosePreset(preset.key)}
                />
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </label>
            ))}
          </div>
          <div className="wizard-fields">
            <TextField label="Origin" hint="Where the agent is allowed to act." value={draft.origin} onChange={(origin) => update({ origin })} placeholder="https://shop.example" />
            <TextField label="Page path" hint="The page the agent must open first." value={draft.openPath} onChange={(openPath) => update({ openPath })} placeholder="/checkout" />
          </div>
          <div className="wizard-fields">
            <TextField label="Agent reference" hint="Optional identifier of the browser agent." value={draft.agentRef} onChange={(agentRef) => update({ agentRef })} placeholder="agent/demo" />
            <TextField label="Workflow reference" hint="Optional name of the automated workflow." value={draft.workflowRef} onChange={(workflowRef) => update({ workflowRef })} placeholder="purchase-v1" />
            <TextField label="Environment" hint="Optional label for where the run happens." value={draft.environment} onChange={(environment) => update({ environment })} placeholder="fixture-store" />
          </div>
        </fieldset>
      )}

      {stepIndex === 1 && (
        <fieldset className="wizard-step" disabled={disabled}>
          <legend>What must happen?</legend>
          <p className="wizard-hint">Every enabled item becomes a required assertion. The verifier decides from real evidence — this only describes the expectation.</p>
          <CheckRow
            label="The agent opens the declared page"
            hint="A navigation event to the origin and path from step 1."
            checked={draft.openNavigationEnabled}
            onChange={(openNavigationEnabled) => update({ openNavigationEnabled })}
          />
          <div className="wizard-sublist">
            {draft.actions.map((action) => (
              <div key={action.id} className="action-row">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={action.enabled}
                    onChange={(event) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, enabled: event.target.checked } : item) })}
                  />
                  <span>{action.label}</span>
                </label>
                {action.enabled && (
                  <div className="action-fields">
                    <TextField label="Event value" hint="Matched against the completed action name." value={action.name} onChange={(name) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, name } : item) })} />
                    <CheckRow label="At most once" hint="A second occurrence fails the assertion." checked={action.atMostOnce} onChange={(atMostOnce) => update({ actions: draft.actions.map((item) => item.id === action.id ? { ...item, atMostOnce } : item) })} compact />
                  </div>
                )}
              </div>
            ))}
            {draft.actions.length === 0 && <p className="wizard-hint">This goal has no action steps. Navigation alone can be enough.</p>}
          </div>
          <div className="network-block">
            <CheckRow label="A network request must be observed" hint="Proves the outcome reached the server, not just the screen." checked={draft.network.enabled} onChange={(enabled) => update({ network: { ...draft.network, enabled } })} />
            {draft.network.enabled && (
              <div className="wizard-fields wizard-fields-compact">
                <TextField label="Method" value={draft.network.method} onChange={(method) => update({ network: { ...draft.network, method } })} />
                <TextField label="Path" value={draft.network.path} onChange={(path) => update({ network: { ...draft.network, path } })} />
                <TextField label="Status" value={String(draft.network.status)} onChange={(value) => update({ network: { ...draft.network, status: Number(value) || 0 } })} />
              </div>
            )}
          </div>
          {enabledActions(draft).length >= 2 && (
            <CheckRow
              label="The actions must happen in this order"
              hint="Adds event-order assertions between consecutive actions."
              checked={draft.enforceActionOrder}
              onChange={(enforceActionOrder) => update({ enforceActionOrder })}
            />
          )}
        </fieldset>
      )}

      {stepIndex === 2 && (
        <fieldset className="wizard-step" disabled={disabled}>
          <legend>What must not happen?</legend>
          <p className="wizard-hint">Forbidden capabilities become unsafe-bypass assertions. A successful-looking final state cannot override them.</p>
          <div className="capability-grid">
            {FORBIDDEN_CAPABILITY_OPTIONS.map((capability) => (
              <label key={capability} className="check-row">
                <input
                  type="checkbox"
                  checked={draft.forbiddenCapabilities.includes(capability)}
                  onChange={(event) => update({ forbiddenCapabilities: event.target.checked ? [...draft.forbiddenCapabilities, capability] : draft.forbiddenCapabilities.filter((item) => item !== capability) })}
                />
                <code>{capability}</code>
              </label>
            ))}
          </div>
          <CheckRow
            label="A specific event must never occur"
            hint="Adds an event-absent assertion, for example a navigation to a known-bad page."
            checked={draft.absentEvent.enabled}
            onChange={(enabled) => update({ absentEvent: { ...draft.absentEvent, enabled } })}
          />
          {draft.absentEvent.enabled && (
            <div className="wizard-fields">
              <TextField label="Event type" value={draft.absentEvent.eventType} onChange={(eventType) => update({ absentEvent: { ...draft.absentEvent, eventType } })} placeholder="navigation.committed" />
              <TextField label="Property path (optional)" value={draft.absentEvent.path} onChange={(path) => update({ absentEvent: { ...draft.absentEvent, path } })} placeholder="/payload/url/path" />
              <TextField label="Property value (optional)" value={draft.absentEvent.value} onChange={(value) => update({ absentEvent: { ...draft.absentEvent, value } })} placeholder="/admin" />
            </div>
          )}
        </fieldset>
      )}

      {stepIndex === 3 && (
        <fieldset className="wizard-step" disabled={disabled}>
          <legend>What are the boundaries?</legend>
          <p className="wizard-hint">Boundaries constrain how the run may operate. Missing or unsafe evidence fails closed regardless of these values.</p>
          <div className="wizard-fields">
            <TextField label="Allowed capabilities" hint="Comma-separated. The agent may only use these." value={draft.allowedCapabilities} onChange={(allowedCapabilities) => update({ allowedCapabilities })} />
            <TextField label="Maximum duration (ms)" hint="Runs longer than this are inconclusive." value={String(draft.maxDurationMs)} onChange={(value) => update({ maxDurationMs: Number(value) || 0 })} />
          </div>
          <CheckRow label="Require session start and end events" hint="Ensures the capture covers the whole run." checked={draft.requireSessionEvents} onChange={(requireSessionEvents) => update({ requireSessionEvents })} />
          <div className="wizard-fields">
            <ChoiceField
              label="Evidence completeness"
              hint="Required completeness refuses partial captures instead of passing on missing evidence."
              value={draft.captureCompleteness}
              options={[{ value: "required", label: "Required" }, { value: "best-effort", label: "Best effort" }]}
              onChange={(captureCompleteness) => update({ captureCompleteness: captureCompleteness as WizardDraft["captureCompleteness"] })}
            />
            <ChoiceField
              label="Capture integrity"
              hint="Stronger integrity demands stronger proof from the collector."
              value={draft.captureIntegrity}
              options={[{ value: "none", label: "None" }, { value: "hash-chain", label: "Hash chain" }, { value: "signed", label: "Signed" }]}
              onChange={(captureIntegrity) => update({ captureIntegrity: captureIntegrity as WizardDraft["captureIntegrity"] })}
            />
          </div>
        </fieldset>
      )}

      {isReview && (
        <fieldset className="wizard-step wizard-review" disabled={disabled}>
          <legend>Review the contract</legend>
          <p className="wizard-hint">This compiles your answers into the same contract schema the expert editor uses. Evidence is never generated here.</p>
          <ul className="review-list">
            <ReviewLine label="Goal" value={WIZARD_PRESETS[draft.preset].label} onEdit={() => setStep(0)} />
            <ReviewLine label="Opens" value={draft.openNavigationEnabled ? `${draft.origin}${draft.openPath}` : "Not declared"} onEdit={() => setStep(0)} />
            <ReviewLine label="Must happen" value={describeMust(draft)} onEdit={() => setStep(1)} />
            <ReviewLine label="Ordering" value={draft.enforceActionOrder && enabledActions(draft).length >= 2 ? "Actions must happen in the listed order" : "Not enforced"} onEdit={() => setStep(1)} />
            <ReviewLine label="Must not happen" value={describeMustNot(draft)} onEdit={() => setStep(2)} />
            <ReviewLine label="Boundaries" value={describeBoundaries(draft)} onEdit={() => setStep(3)} />
          </ul>
          <label className="wizard-json">
            <span className="wizard-json-label">
              <span>CONTRACT DRAFT</span>
              <span>Generated from your answers. You can edit it here.</span>
            </span>
            <textarea value={activeJson} onChange={(event) => { setEditedJson(event.target.value); setLoaded(false); }} spellCheck={false} rows={16} aria-label="Contract draft JSON" aria-invalid={!jsonValidity.valid} />
          </label>
          {editedJson !== null && <button type="button" className="text-button wizard-reset" onClick={() => setEditedJson(null)}>Reset to generated draft</button>}
          {!jsonValidity.valid && <p className="wizard-issue" role="alert">{jsonValidity.message}</p>}
          {jsonValidity.valid && editedJson === null && currentIssueCount > 0 && (
            <div className="wizard-issue" role="alert">
              <strong>{currentIssueCount} issue{currentIssueCount === 1 ? "" : "s"} to fix:</strong>
              <ul>{issues.map((issue, index) => <li key={index}><span>!</span>{issue.message}</li>)}</ul>
            </div>
          )}
          <div className="wizard-load">
            <button className="primary-button" type="button" onClick={loadIntoWorkbench} disabled={disabled || !canLoad}>
              <span>{loaded ? "Loaded into workbench" : "Load into workbench"}</span>
              <span className="button-arrow" aria-hidden="true"><ArrowUpRight /></span>
            </button>
            <span className="wizard-load-note">{loaded ? "The contract draft now sits in the expert editor. The evidence bundle is untouched." : "Sends the draft to the expert JSON editor. It does not verify anything yet."}</span>
          </div>
        </fieldset>
      )}

      <div className="wizard-nav">
        <button className="text-button" type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={disabled || stepIndex === 0}>← Back</button>
        <button className="text-button" type="button" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} disabled={disabled || isReview}>Next →</button>
      </div>
    </section>
  );
}

function describeMust(draft: WizardDraft): string {
  const parts: string[] = [];
  if (draft.openNavigationEnabled) parts.push("open the declared page");
  for (const action of enabledActions(draft)) parts.push(`complete "${action.name}"${action.atMostOnce ? " at most once" : ""}`);
  if (draft.network.enabled && draft.network.path.trim()) parts.push(`emit ${draft.network.method} ${draft.network.path}`);
  return parts.length > 0 ? parts.join(", ") : "Nothing declared yet";
}

function describeMustNot(draft: WizardDraft): string {
  const parts: string[] = [];
  if (draft.forbiddenCapabilities.length > 0) parts.push(`no ${draft.forbiddenCapabilities.join(", ")}`);
  if (draft.absentEvent.enabled && draft.absentEvent.eventType.trim()) parts.push(`no "${draft.absentEvent.eventType.trim()}" events`);
  return parts.length > 0 ? parts.join("; ") : "Nothing forbidden yet";
}

function describeBoundaries(draft: WizardDraft): string {
  const parts: string[] = [];
  if (draft.allowedCapabilities.trim()) parts.push(`capabilities: ${draft.allowedCapabilities.trim()}`);
  if (draft.maxDurationMs > 0) parts.push(`max ${draft.maxDurationMs} ms`);
  parts.push(`evidence completeness ${draft.captureCompleteness}`);
  return parts.join(" · ");
}

function ReviewLine({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <li className="review-line">
      <span className="review-label">{label}</span>
      <span className="review-value">{value}</span>
      <button type="button" className="review-change" onClick={onEdit}>Change</button>
    </li>
  );
}

function TextField({ label, hint, value, onChange, placeholder }: { label: string; hint?: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="wizard-field">
      <span>{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} spellCheck={false} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ChoiceField({ label, hint, value, options, onChange }: { label: string; hint?: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="wizard-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function CheckRow({ label, hint, checked, onChange, compact }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void; compact?: boolean }) {
  return (
    <label className={`check-row ${compact ? "check-row-compact" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="check-copy"><span>{label}</span>{hint && <small>{hint}</small>}</span>
    </label>
  );
}

function ArrowUpRight() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="arrow-icon"><path d="M3 13 13 3M6 3h7v7" /></svg>;
}
