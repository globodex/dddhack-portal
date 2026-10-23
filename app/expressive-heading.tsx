"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import DotAvatar from "./dot-avatar";
import { dotColors, dotExpressions } from "../lib/avatar-contract";

type DotColor = keyof typeof dotColors;
type DotExpression = keyof typeof dotExpressions;
export type HeadingDotProps = {
  color?: DotColor;
  expression?: DotExpression;
  paused?: boolean;
  size?: number | string;
};

/** Offset only the existing typographic marks, in the avatar's 80-unit viewBox. */
export function headingMarkOffset(dx: number, dy: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 };
  const length = Math.max(120, Math.hypot(dx, dy));
  return { x: (dx / length) * 6, y: (dy / length) * 4 };
}

export function HeadingDot({
  color = "blue",
  expression = "squeezed",
  paused = false,
  size = "0.7em",
}: HeadingDotProps) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = root.current;
    const marks = node?.querySelector("text");
    if (!node || !marks) return;
    const media = matchMedia(
      "(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)",
    );
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      marks.style.transform = "translate(0px, 0px)";
    };
    const move = (event: PointerEvent) => {
      if (paused || media.matches || event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      const { clientX, clientY } = event;
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const { x, y } = headingMarkOffset(
          clientX - rect.left - rect.width / 2,
          clientY - rect.top - rect.height / 2,
        );
        marks.style.transform = `translate(${x}px, ${y}px)`;
        frame = 0;
      });
    };
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget === null) reset();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    reset();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", reset);
    return () => {
      reset();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", reset);
    };
  }, [paused]);
  return (
    <span
      ref={root}
      className="expressive-heading-dot"
      aria-hidden="true"
      data-paused={paused}
      style={
        {
          "--heading-dot-size": typeof size === "number" ? `${size}px` : size,
        } as CSSProperties
      }
    >
      <DotAvatar color={color} expression={expression} size={80} />
    </span>
  );
}

export default function ExpressiveHeading({
  children,
  as: Tag = "h1",
  id,
  className = "",
  ...dot
}: HeadingDotProps & {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <Tag id={id} className={`expressive-heading ${className}`.trim()}>
      {children}
      <HeadingDot {...dot} />
    </Tag>
  );
}
