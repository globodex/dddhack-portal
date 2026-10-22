"use client";
import { useEffect, useRef } from "react";
export default function Dots({
  variant = 0,
  landing = false,
}: {
  variant?: number;
  landing?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      last = 0,
      alive = true;
    let w = 0,
      h = 0;
    const pointer = { x: -999, y: -999 };
    let particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      homeX: number;
      homeY: number;
    }[] = [];
    const resize = () => {
      cancelAnimationFrame(frame);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(devicePixelRatio, 1.5);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = landing ? (w < 600 ? 25 : 64) : 28;
      particles = Array.from({ length: count }, (_, i) => {
        const a = i * 2.39996 + variant * 0.8;
        const rad = Math.sqrt((i + 0.5) / count) * Math.min(w, h) * 0.39;
        const x = w / 2 + Math.cos(a) * rad,
          y = h / 2 + Math.sin(a) * rad;
        return {
          x: landing ? Math.random() * w : x,
          y: landing ? -Math.random() * 100 : y,
          vx: 0,
          vy: landing ? 0.5 + Math.random() * 0.6 : 0,
          r: landing ? 2 + Math.random() * 5 : 3.5,
          homeX: x,
          homeY: y,
        };
      });
      draw(0);
    };
    const draw = (t: number) => {
      if (!alive) return;
      if (t && t - last < 32) {
        frame = requestAnimationFrame(draw);
        return;
      }
      last = t;
      ctx.clearRect(0, 0, w, h);
      const reduced = media.matches;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (reduced) {
          p.x = p.homeX;
          p.y = p.homeY;
        } else {
          const dx = p.x - pointer.x,
            dy = p.y - pointer.y,
            d = Math.hypot(dx, dy);
          if (d < 110 && d > 0) {
            p.vx += (dx / d) * (110 - d) * 0.008;
            p.vy += (dy / d) * (110 - d) * 0.008;
          }
          if (landing) {
            p.vy += 0.008;
            p.vy = Math.min(p.vy, 1.2);
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            if (p.y > h + 10) {
              p.y = -10;
              p.x = Math.random() * w;
            }
          } else {
            p.vx += (p.homeX - p.x) * 0.012;
            p.vy += (p.homeY - p.y) * 0.012;
            p.vx *= 0.88;
            p.vy *= 0.88;
            p.x += p.vx;
            p.y += p.vy;
          }
        }
        ctx.fillStyle = landing
          ? i % 5 === 0
            ? "#356b58"
            : "#183c30"
          : ["#e07544", "#4d7163", "#5474bc", "#936aad"][variant % 4];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const leave = () => {
      pointer.x = pointer.y = -999;
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) draw(0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    window.addEventListener("pointerup", leave, { passive: true });
    window.addEventListener("pointercancel", leave, { passive: true });
    document.addEventListener("visibilitychange", restart);
    media.addEventListener("change", restart);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("pointerup", leave);
      window.removeEventListener("pointercancel", leave);
      document.removeEventListener("visibilitychange", restart);
      media.removeEventListener("change", restart);
    };
  }, [variant, landing]);
  return (
    <canvas
      className={landing ? "falling-dots" : "heading-dots"}
      ref={ref}
      aria-hidden="true"
    />
  );
}
