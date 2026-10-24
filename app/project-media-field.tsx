import { useRef } from "react";
import { Image as ImageIcon, Upload, Trash2 } from "lucide-react";

export default function ProjectMediaField({ kind, value, info, error, busy, onUpload, onRemove }: {
  kind: "logo" | "banner";
  value: string;
  info?: string;
  error?: string;
  busy: boolean;
  onUpload: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const title = kind === "logo" ? "Project logo" : "Project banner";
  const description = `submission-${kind}-description`;
  const errorId = `submission-${kind}-error`;
  return (
    <section className={`submission-media-field submission-media-field-${kind}`} aria-labelledby={`submission-${kind}-label`} aria-busy={busy}>
      <h2 id={`submission-${kind}-label`}>{title} <span className="required-marker" aria-hidden="true">*</span></h2>
      <div className={`submission-media-frame submission-media-frame-${kind}`} data-empty={!value}>
        {value ? <img src={value} alt={`${title} preview`} /> : <div className="submission-media-empty"><ImageIcon size={28} strokeWidth={1.5} aria-hidden="true" /><span>{kind === "banner" ? "Your project at a glance" : "Your project identity"}</span></div>}
      </div>
      <div className="submission-media-controls">
        <button id={`submission-${kind}-control`} className="button secondary" type="button" disabled={busy}
          aria-invalid={error ? true : undefined} aria-describedby={`${description}${error ? ` ${errorId}` : ""}`}
          onClick={() => input.current?.click()}><Upload size={17} aria-hidden="true" />{busy ? "Preparing…" : value ? "Replace" : `Upload ${kind}`}</button>
        {value && <button className="button secondary submission-remove-image" type="button" aria-label={`Remove ${kind} image`} onClick={onRemove}><Trash2 size={17} aria-hidden="true" /></button>}
        <input ref={input} type="file" accept="image/png,image/jpeg" hidden aria-label={`Upload ${kind}`} onChange={(event) => { onUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </div>
      <p className="submission-media-description" id={description}>PNG or JPEG · Up to {kind === "logo" ? "1" : "5"} MB · Any aspect ratio</p>
      {info && <p className="submission-media-file" title={info}>{info}</p>}
      {error && <p className="submission-field-error" id={errorId} role="alert">{error}</p>}
    </section>
  );
}
