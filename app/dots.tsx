"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import DotAvatar from "./dot-avatar";
import {
  desktopDots,
  mobileDots,
  stripDots,
  airblowerTarget,
  advanceDot,
  type DotState,
} from "./home-motion";

export default function Dots({
  paused = false,
  bottom = false,
}: {
  paused?: boolean;
  bottom?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = root.current;
    if (!stage) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const nodes = [...stage.querySelectorAll<HTMLElement>(".public-dot")];
    const marks = nodes.map((node) =>
      node.querySelector<SVGTextElement>("text"),
    );
    let width = 0,
      height = 0,
      left = 0,
      top = 0,
      frame = 0,
      previous = 0;
    let entrance = 0,
      visible = true,
      alive = true,
      active = false;
    let pointer: { x: number; y: number } | null = null;
    let touchTimer: ReturnType<typeof setTimeout> | undefined;
    let dots: (DotState & { startY: number; angle: number })[] = [];
    const paint = () => {
      dots.forEach((dot, i) => {
        nodes[i].style.transform =
          `translate3d(${dot.x - dot.r}px,${dot.y - dot.r}px,0)`;
        if (marks[i]) {
          const attention =
            pointer && !paused && !reduced.matches
              ? Math.max(-3, Math.min(3, (pointer.x - dot.x) / 80))
              : 0;
          marks[i]!.style.transform =
            `translate(${attention}px,0px) rotate(${dot.angle}deg)`;
          marks[i]!.style.transformOrigin = "40px 40px";
        }
      });
    };
    const draw = (now: number) => {
      frame = 0;
      if (!alive || !visible || document.hidden || paused || reduced.matches)
        return;
      const dt = previous ? (now - previous) / 16.67 : 1;
      previous = now;
      if (!entrance) entrance = now;
      const progress = Math.min(1, (now - entrance) / 850);
      const ease = 1 - Math.pow(1 - progress, 3);
      let moving = progress < 1;
      dots.forEach((dot) => {
        if (progress < 1) dot.y = dot.startY + (dot.homeY - dot.startY) * ease;
        else
          moving =
            advanceDot(
              dot,
              airblowerTarget(dot, pointer, width, height, bottom),
              dt,
              width,
              height,
              bottom,
            ) || moving;
      });
      paint();
      if (moving) frame = requestAnimationFrame(draw);
    };
    const start = () => {
      if (
        !frame &&
        !paused &&
        !reduced.matches &&
        visible &&
        !document.hidden &&
        width &&
        height
      )
        frame = requestAnimationFrame(draw);
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      pointer = null;
      if (paused || reduced.matches) {
        dots.forEach((dot) => {
          dot.x = dot.homeX;
          dot.y = dot.homeY;
          dot.vx = dot.vy = 0;
        });
        paint();
      } else start();
    };
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      left = rect.left + window.scrollX;
      top = rect.top + window.scrollY;
      active = width > 0 && height > 0;
      const compact = innerWidth < 1000;
      const descriptors = bottom
        ? stripDots
        : compact
          ? mobileDots
          : desktopDots;
      const scale = bottom ? Math.min(1.55, width / 760) : width / 480;
      dots = descriptors.map((item, i) => {
        const r = (item.diameter * scale) / 2;
        const homeX = bottom
          ? ((i + 0.5) * width) / descriptors.length
          : item.x * scale;
        const homeY = bottom ? height - r * 0.65 : item.y * scale;
        nodes[i].style.display = "block";
        nodes[i].style.width = nodes[i].style.height = `${r * 2}px`;
        nodes[i].querySelector("circle")?.setAttribute("fill", item.fill);
        const startY = -r * (i + 2);
        return {
          x: homeX,
          y: paused || reduced.matches ? homeY : startY,
          homeX,
          homeY,
          r,
          vx: 0,
          vy: 0,
          startY,
          angle: item.angle || 0,
        };
      });
      nodes.slice(descriptors.length).forEach((node) => {
        node.style.display = "none";
      });
      entrance = 0;
      previous = 0;
      paint();
      reset();
    };
    const move = (event: PointerEvent) => {
      if (
        !active ||
        paused ||
        reduced.matches ||
        (!bottom && event.pointerType !== "mouse")
      )
        return;
      if (event.pointerType !== "mouse" && event.type !== "pointerdown") return;
      const x = event.pageX - left,
        y = event.pageY - top;
      pointer = x >= 0 && x <= width && y >= 0 && y <= height ? { x, y } : null;
      if (event.pointerType !== "mouse") {
        clearTimeout(touchTimer);
        touchTimer = setTimeout(() => {
          pointer = null;
          start();
        }, 250);
      }
      start();
    };
    const leave = () => {
      pointer = null;
      start();
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
        pointer = null;
      } else start();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(stage);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
        pointer = null;
      } else start();
    });
    intersection.observe(stage);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    window.addEventListener("pointercancel", leave, { passive: true });
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", reset);
    measure();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      clearTimeout(touchTimer);
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("pointercancel", leave);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", reset);
    };
  }, [paused, bottom]);
  const items = bottom ? stripDots : desktopDots;
  return (
    <div
      ref={root}
      className={bottom ? "dot-field bottom-dots" : "dot-field hero-dots"}
      aria-hidden="true"
      data-dot-count={bottom ? 12 : 8}
    >
      {items.map((dot, i) => (
        <span
          key={i}
          className="public-dot"
          style={
            {
              "--strip-index": i,
              "--desktop-x": `${(dot.x / 480) * 100}%`,
              "--desktop-y": `${(dot.y / 440) * 100}%`,
              "--desktop-width": `${(dot.diameter / 480) * 100}%`,
            } as CSSProperties
          }
        >
          <DotAvatar
            color={dot.color}
            expression={dot.expression}
            size={80}
            decorative
          />
        </span>
      ))}
    </div>
  );
}
