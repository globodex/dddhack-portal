"use client";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Copy, Share2, X } from "lucide-react";
import {
  projectShareCaption,
  projectShareHashtags,
  projectShareIntents,
  projectShareText,
  projectShareUrl,
  validProjectPublicPath,
} from "../lib/project-share";
import { trapDialogFocus } from "./dialog-focus";
import { trackDialogHistory } from "./dialog-history";

const locks = new WeakMap<
  Document,
  { count: number; body: string; html: string }
>();
function lockProjectScroll(document: Document) {
  const lock = locks.get(document) || {
    count: 0,
    body: document.body.style.overflow,
    html: document.documentElement.style.overflow,
  };
  lock.count++;
  locks.set(document, lock);
  document.body.style.overflow = document.documentElement.style.overflow =
    "hidden";
  return () => {
    if (--lock.count) return;
    document.body.style.overflow = lock.body;
    document.documentElement.style.overflow = lock.html;
    locks.delete(document);
  };
}

export function useProjectDialog(
  dialog: RefObject<HTMLDialogElement | null>,
  dismiss: () => void,
) {
  const close = useRef(dismiss);
  close.current = dismiss;
  useEffect(() => {
    const popup = dialog.current;
    if (!popup) return;
    const document = popup.ownerDocument;
    const previous = document.activeElement as HTMLElement | null;
    popup.showModal();
    const unlock = lockProjectScroll(document);
    const releaseHistory = trackDialogHistory(() => close.current(), previous);
    const focus = requestAnimationFrame(() =>
      popup
        .querySelector<HTMLElement>("[data-initial-focus]")
        ?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(focus);
      releaseHistory();
      popup.close();
      unlock();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const modal =
            document.querySelector<HTMLDialogElement>("dialog:modal");
          if (
            previous?.isConnected &&
            !previous.matches(":disabled") &&
            (!modal || modal.contains(previous))
          )
            previous.focus({ preventScroll: true });
          else
            (
              modal?.querySelector<HTMLElement>("button:enabled,a[href]") ||
              document.getElementById("dashboard-tab-project") ||
              document.getElementById("main")
            )?.focus({ preventScroll: true });
        }),
      );
    };
  }, [dialog]);
}

export function ProjectShareDialog({
  url,
  projectName,
  onClose,
}: {
  url: string;
  projectName?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    manual = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [manualText, setManualText] = useState("");
  useProjectDialog(dialog, onClose);
  const copy = async (text: string, message: string) => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setManualText("");
      setNotice(message);
    } catch {
      setFailed(true);
      setNotice("Could not copy. Select the text and copy it manually.");
      if (text === url) {
        input.current?.focus();
        input.current?.select();
      } else {
        setManualText(text);
        requestAnimationFrame(() => {
          manual.current?.focus();
          manual.current?.select();
        });
      }
    }
  };
  const instagram = async () => {
    setNotice("");
    setFailed(false);
    if (navigator.share) {
      try {
        await navigator.share({
          title: projectName || "Hackathon project",
          text: `${projectShareCaption}\n\n${projectShareHashtags.map((tag) => `#${tag}`).join(" ")}`,
          url,
        });
      } catch (cause) {
        if ((cause as Error).name !== "AbortError")
          await copy(
            projectShareText(url),
            "Post text copied. Open Instagram to paste it.",
          );
      }
    } else
      await copy(
        projectShareText(url),
        "Post text copied. Open Instagram to paste it.",
      );
  };
  return (
    <dialog
      ref={dialog}
      className="project-share-dialog"
      aria-labelledby={`${id}-title`}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header>
        <h2 id={`${id}-title`}>Share project</h2>
        <button
          className="project-dialog-close"
          type="button"
          data-initial-focus
          aria-label="Close share"
          onClick={onClose}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      {projectName && <p className="project-share-name">{projectName}</p>}
      <div className="project-share-services" role="group" aria-label="Share options">
        {projectShareIntents(url).map((service) => (
          <a
            key={service.id}
            href={service.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${service.name}`}
            onClick={() => {
              if (service.id !== "x")
                void copy(
                  projectShareText(url),
                  `Post text copied. Paste it into ${service.name}.`,
                );
            }}
          >
            <img
              src={`/icons/social/${service.id}.svg`}
              alt=""
              width="26"
              height="26"
            />
            <span>{service.name}</span>
          </a>
        ))}
        <button
          type="button"
          aria-label="Share to Instagram using your device or copy post text"
          onClick={() => void instagram()}
        >
          <img
            src="/icons/social/instagram.svg"
            alt=""
            width="26"
            height="26"
          />
          <span>Instagram</span>
        </button>
      </div>
      <div className="project-share-copy-row">
        <label className="sr-only" htmlFor={`${id}-url`}>
          Project link
        </label>
        <input
          ref={input}
          id={`${id}-url`}
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" onClick={() => void copy(url, "Link copied.")}>
          <Copy size={17} aria-hidden="true" />
          Copy
        </button>
      </div>
      {manualText && (
        <label className="project-share-manual">
          Post text
          <textarea
            ref={manual}
            readOnly
            value={manualText}
            rows={5}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <p
        className="project-share-notice"
        data-error={failed}
        role={failed ? "alert" : "status"}
      >
        {notice || "Facebook and LinkedIn share the link. Add your message there."}
      </p>
    </dialog>
  );
}

export default function ProjectShare({
  publicPath,
  projectName,
  className = "",
  showLabel = false,
}: {
  publicPath: string;
  projectName?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  if (!validProjectPublicPath(publicPath)) return null;
  return (
    <>
      <button
        type="button"
        className={`project-share-trigger ${className}`}
        aria-label="Share"
        onClick={() =>
          setUrl(projectShareUrl(publicPath, window.location.origin))
        }
      >
        <Share2 size={20} aria-hidden="true" />
        {showLabel && <span>Share</span>}
      </button>
      {url && (
        <ProjectShareDialog
          url={url}
          projectName={projectName}
          onClose={() => setUrl(null)}
        />
      )}
    </>
  );
}
