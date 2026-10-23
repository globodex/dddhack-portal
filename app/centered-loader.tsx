"use client";
import { useLayoutEffect, useRef } from "react";

export default function CenteredLoader({
  label = "Loading…",
  scope = "container",
  paused = false,
}: {
  label?: string;
  scope?: "container" | "viewport";
  paused?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || scope === "viewport") return;
    const parent = node.parentElement;
    const update = () => {
      const viewport = window.visualViewport;
      const bottom = viewport
        ? viewport.offsetTop + viewport.height
        : innerHeight;
      const padding = parent
        ? parseFloat(getComputedStyle(parent).paddingBottom) || 0
        : 0;
      const height = Math.max(
        0,
        bottom - Math.max(0, node.getBoundingClientRect().top) - padding,
      );
      node.style.setProperty("--loader-available-height", `${height}px`);
    };
    const observer = new ResizeObserver(update);
    if (parent) observer.observe(parent);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [scope]);
  return (
    <div
      ref={root}
      className="centered-loader"
      data-scope={scope}
      data-paused={paused}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="centered-loader-content">
        <span className="centered-loader-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}
