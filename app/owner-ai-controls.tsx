"use client";
import { useRef, useState } from "react";
import { Cpu, Save } from "lucide-react";
import { aiModelChoices, modelPricing } from "../lib/ai-model-catalog";
import { useHydrated } from "./use-hydrated";
type Metric = { tokens: number | null; knownResponses: number };
export type OwnerAIData = {
  model: string | null;
  revision: number;
  source: string;
  responses: number;
  input: Metric;
  output: Metric;
  cached: Metric;
  total: Metric;
  costUSD: null;
  coverage: string;
  costReason: string;
};
export default function OwnerAIControls({
  owner,
  data,
  run,
}: {
  owner: boolean;
  data?: OwnerAIData;
  run: (action: string, values: Record<string, unknown>) => Promise<unknown>;
}) {
  const hydrated = useHydrated(),
    pending = useRef(false),
    [model, setModel] = useState(data?.model || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!owner) return null;
  if (!data)
    return (
      <section className="admin-settings-section">
        <h2>AI model</h2>
        <p role="status">
          Model settings are unavailable. Refresh after the matching backend
          update.
        </p>
      </section>
    );
  return (
    <section
      className="admin-settings-section owner-ai-model"
      aria-label="Owner AI model and usage"
    >
      <header>
        <Cpu size={22} aria-hidden="true" />
        <div>
          <h2>AI model</h2>
          <span>
            Owner only ·{" "}
            {data.source === "owner" ? "Portal selection" : "Backend default"}
          </span>
        </div>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          try {
            await run("change-ai-model", {
              model: model.trim(),
              expectedRevision: data.revision,
            });
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not save the model.",
            );
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Evaluation model
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
            disabled={!hydrated || busy}
          >
            <option value="" disabled>Choose a model</option>
            {model && !aiModelChoices.some(choice => choice.id === model) && <option value={model}>{model} · existing selection</option>}
            {aiModelChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
          </select>
        </label>
        <button
          type="submit"
          className="button"
          disabled={
            !hydrated || busy || !model.trim() || model.trim() === data.model
          }
          aria-busy={busy}
        >
          <Save size={18} aria-hidden="true" />
          {busy ? "Saving…" : "Save model"}
        </button>
      </form>
      <div className="owner-ai-model-prices" aria-label="Published model prices">
        {aiModelChoices.map(choice => <article key={choice.id} aria-label={`${choice.name} pricing`}>
          <strong>{choice.name}</strong>
          <span>Input ${choice.input} · Output ${choice.output}</span>
          <small>Cached input ${choice.cachedInput} / {modelPricing.unit}</small>
        </article>)}
      </div>
      <p className="owner-ai-note">USD per {modelPricing.unit}. <a href={modelPricing.source} target="_blank" rel="noopener noreferrer">Official pricing</a> · checked {modelPricing.checkedAt}. {modelPricing.scope}</p>
      <p className="owner-ai-note">
        Applies to future evaluations. API access and compatibility are not
        verified by saving.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <h3>Saved model usage · {data.model || "Not configured"}</h3>
      <div className="owner-ai-usage">
        <article>
          <span>Recorded responses</span>
          <strong>{data.responses.toLocaleString()}</strong>
        </article>
        {(
          [
            ["Input", data.input],
            ["Output", data.output],
            ["Cached input", data.cached],
            ["Total tokens", data.total],
          ] as const
        ).map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>
              {value.tokens === null
                ? "Unavailable"
                : value.tokens.toLocaleString()}
            </strong>
            {value.knownResponses > 0 &&
              value.knownResponses < data.responses && (
                <small>
                  {value.knownResponses}/{data.responses} responses · partial
                </small>
              )}
          </article>
        ))}
        <article>
          <span>Charged cost</span>
          <strong>Unavailable</strong>
        </article>
      </div>
      <p className="owner-ai-note">{data.coverage}</p>
      <p className="owner-ai-note">{data.costReason}</p>
    </section>
  );
}
