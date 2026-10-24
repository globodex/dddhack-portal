"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import DotAvatar from "./dot-avatar";

// Reuse the hero's small SVG artwork without importing the Home motion bundle.
const dots = [
  { color: "blue", expression: "squeezed", x: 12, size: 100, angle: -12 },
  { color: "orange", expression: "sleepy", x: 28, size: 64, angle: 14 },
  { color: "green", expression: "plus", x: 46, size: 88, angle: -8 },
  { color: "purple", expression: "round", x: 66, size: 104, angle: 12 },
  { color: "charcoal", expression: "cheerful", x: 81, size: 68, angle: -14 },
  { color: "grey", expression: "star", x: 93, size: 52, angle: 10 },
];

export default function SubmissionDots() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = root.current;
    if (!stage) return;
    const nodes = [...stage.querySelectorAll<HTMLElement>(".submission-dot")];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const compact = matchMedia("(max-width: 740px)");
    const offsets = nodes.map(() => ({ x: 0, y: 0, targetX: 0, targetY: 0 }));
    let visible = false,
      listening = false,
      frame = 0;
    const paint = () =>
      nodes.forEach((node, index) => {
        const offset = offsets[index];
        node.style.translate = `${offset.x}px ${offset.y}px`;
      });
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      stage.dataset.running = "false";
    };
    const draw = () => {
      frame = 0;
      let moving = false;
      offsets.forEach((offset) => {
        const dx = offset.targetX - offset.x,
          dy = offset.targetY - offset.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.2) {
          offset.x += dx * 0.18;
          offset.y += dy * 0.18;
          moving = true;
        } else {
          offset.x = offset.targetX;
          offset.y = offset.targetY;
        }
      });
      paint();
      if (moving) frame = requestAnimationFrame(draw);
      else stage.dataset.running = "false";
    };
    const start = () => {
      if (!listening || frame) return;
      stage.dataset.running = "true";
      frame = requestAnimationFrame(draw);
    };
    const leave = () => {
      offsets.forEach((offset) => {
        offset.targetX = offset.targetY = 0;
      });
      start();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !listening) return;
      const bounds = stage.getBoundingClientRect();
      const x = event.clientX - bounds.left,
        y = event.clientY - bounds.top;
      const inside =
        x >= 0 && x <= bounds.width && y >= 0 && y <= bounds.height;
      offsets.forEach((offset, index) => {
        const node = nodes[index];
        const dx = node.offsetLeft + node.offsetWidth / 2 - x;
        const dy = node.offsetTop + node.offsetHeight / 2 - y;
        const distance = Math.hypot(dx, dy);
        const force = inside ? Math.max(0, 1 - distance / 150) * 44 : 0;
        offset.targetX = (dx / (distance || 1)) * force;
        offset.targetY = (dy / (distance || 1)) * force;
      });
      start();
    };
    const sync = () => {
      const active =
        visible &&
        !document.hidden &&
        !reduced.matches &&
        fine.matches &&
        !compact.matches;
      stage.dataset.motion = active ? "interactive" : "static";
      if (active === listening) return;
      listening = active;
      if (active) {
        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("blur", leave);
        window.addEventListener("scroll", leave, {
          passive: true,
          capture: true,
        });
      } else {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("blur", leave);
        window.removeEventListener("scroll", leave, true);
        stop();
        offsets.forEach((offset) => {
          offset.x = offset.y = offset.targetX = offset.targetY = 0;
        });
        paint();
      }
    };
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    intersection.observe(stage);
    document.addEventListener("visibilitychange", sync);
    [reduced, fine, compact].forEach((query) =>
      query.addEventListener("change", sync),
    );
    return () => {
      listening = false;
      stop();
      intersection.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", leave);
      window.removeEventListener("scroll", leave, true);
      document.removeEventListener("visibilitychange", sync);
      [reduced, fine, compact].forEach((query) =>
        query.removeEventListener("change", sync),
      );
    };
  }, []);
  return (
    <div
      ref={root}
      className="submission-dots"
      aria-hidden="true"
      data-motion="static"
      data-running="false"
    >
      {dots.map((dot, index) => (
        <span
          className="submission-dot"
          key={dot.color}
          style={
            {
              "--dot-x": `${dot.x}%`,
              "--dot-size": `${dot.size}px`,
              "--dot-angle": `${dot.angle}deg`,
              "--dot-index": index,
            } as CSSProperties
          }
        >
          <DotAvatar
            color={dot.color}
            expression={dot.expression}
            size={dot.size}
            decorative
          />
        </span>
      ))}
    </div>
  );
}
