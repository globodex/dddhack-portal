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
  const entered = useRef(false);
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
      frame = 0,
      previous = 0;
    let entrance = 0,
      visible = false,
      alive = true,
      active = false;
    let pointer: { x: number; y: number } | null = null;
    let touchTimer: ReturnType<typeof setTimeout> | undefined;
    let dots: (DotState & { startY: number; angle: number })[] = [];
    const stop = () => {
      cancelAnimationFrame(frame);
      clearTimeout(touchTimer);
      frame = 0;
      previous = 0;
      pointer = null;
      stage.dataset.running = "false";
    };
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
      if (!alive || !visible || document.hidden || paused || reduced.matches) {
        stage.dataset.running = "false";
        return;
      }
      const elapsed = previous ? Math.min(now - previous, 64) : 0;
      const dt = elapsed ? elapsed / 16.67 : 1;
      previous = now;
      entered.current = true;
      // Count visible animation time, so returning to the tab cannot skip ahead.
      entrance = Math.min(850, entrance + elapsed);
      const progress = entrance / 850;
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
      else {
        previous = 0;
        stage.dataset.running = "false";
      }
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
      ) {
        stage.dataset.running = "true";
        frame = requestAnimationFrame(draw);
      }
    };
    const reset = () => {
      stop();
      if (paused || reduced.matches) {
        if (reduced.matches) entered.current = true;
        entrance = 850;
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
      if (width === rect.width && height === rect.height) return;
      width = rect.width;
      height = rect.height;
      active = width > 0 && height > 0;
      const entering = !entered.current && !paused && !reduced.matches;
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
          ? Math.max(
              r,
              Math.min(width - r, ((i + 0.5) * width) / descriptors.length),
            )
          : item.x * scale;
        const homeY = bottom ? height - r * 0.65 : item.y * scale;
        nodes[i].style.display = "block";
        nodes[i].style.width = nodes[i].style.height = `${r * 2}px`;
        nodes[i].querySelector("circle")?.setAttribute("fill", item.fill);
        const startY = -r * (i + 2);
        return {
          x: homeX,
          y: entering ? startY : homeY,
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
      entrance = entering ? 0 : 850;
      previous = 0;
      paint();
      reset();
    };
    const move = (event: PointerEvent) => {
      if (
        !active ||
        !visible ||
        document.hidden ||
        paused ||
        reduced.matches ||
        (!bottom && event.pointerType !== "mouse")
      )
        return;
      if (event.pointerType !== "mouse" && event.type !== "pointerdown") return;
      // Sticky chapters move without resizing; use their current viewport bounds.
      const rect = stage.getBoundingClientRect();
      const x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      const next =
        x >= 0 && x <= width && y >= 0 && y <= height ? { x, y } : null;
      if (!pointer && !next) return;
      pointer = next;
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
      if (!pointer) return;
      clearTimeout(touchTimer);
      pointer = null;
      start();
    };
    const leaveWindow = (event: PointerEvent) => {
      if (!event.relatedTarget) leave();
    };
    const visibility = () => {
      stage.dataset.visible = String(visible && !document.hidden);
      if (document.hidden) stop();
      else start();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(stage);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      stage.dataset.visible = String(visible && !document.hidden);
      if (!visible) stop();
      else start();
    });
    intersection.observe(stage);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    window.addEventListener("pointercancel", leave, { passive: true });
    window.addEventListener("pointerout", leaveWindow, { passive: true });
    window.addEventListener("scroll", leave, { passive: true, capture: true });
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", reset);
    stage.dataset.visible = "false";
    measure();
    return () => {
      alive = false;
      stop();
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("pointercancel", leave);
      window.removeEventListener("pointerout", leaveWindow);
      window.removeEventListener("scroll", leave, true);
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
      data-dot-count={items.length}
    >
      {items.map((dot, i) => (
        <span
          key={i}
          className="public-dot"
          style={
            {
              "--strip-index": i,
              "--strip-count": items.length,
              "--strip-width": `min(${dot.diameter * 1.55}px, calc(100vw * ${dot.diameter} / 760))`,
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
