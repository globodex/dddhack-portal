"use client";
import { useEffect, useRef } from "react";
export default function Dots({
  paused = false,
  bottom = false,
}: {
  paused?: boolean;
  bottom?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      w = 0,
      h = 0,
      visible = true,
      alive = true,
      previous = 0,
      entranceStart = 0;
    const point = { x: -9999, y: -9999 };
    const colors = [
      "#f16d00",
      "#00ab43",
      "#006afe",
      "#924ff7",
      "#232323",
      "#e0e0e0",
    ];
    let dots: {
      x: number;
      y: number;
      hx: number;
      hy: number;
      r: number;
      vx: number;
      vy: number;
      startY: number;
    }[] = [];
    const draw = (time = performance.now()) => {
      if (!alive) return;
      const dt = previous ? Math.min(2, (time - previous) / 16.67) : 1;
      previous = time;
      ctx.clearRect(0, 0, w, h);
      if (!entranceStart && time) entranceStart = time;
      const progress = time ? Math.min(1, (time - entranceStart) / 850) : 0;
      const ease = 1 - Math.pow(1 - progress, 3);
      let moving = progress < 1;
      for (let i = 0; i < dots.length; i++) {
        const p = dots[i];
        if (paused || reduced.matches) {
          p.x = p.hx;
          p.y = p.hy;
          p.vx = p.vy = 0;
        } else {
          const dx = p.hx - point.x,
            dy = p.hy - point.y,
            distance = Math.hypot(dx, dy),
            range = p.r + (bottom ? 50 : 90),
            force = distance < range ? 18 * (1 - distance / range) : 0,
            targetX = p.hx + (distance > 1 ? (dx / distance) * force : 0),
            targetY = p.hy + (distance > 1 ? (dy / distance) * force : 0);
          p.vx = (targetX - p.x) * Math.min(1, 0.18 * dt);
          p.vy = (targetY - p.y) * Math.min(1, 0.18 * dt);
          p.x += p.vx;
          p.y = progress < 1 ? p.startY + (p.hy - p.startY) * ease : p.y + p.vy;
          p.x = Math.max(p.r, Math.min(w - p.r, p.x));
          if (progress === 1) p.y = Math.max(p.r, Math.min(h - p.r, p.y));
          moving ||= Math.abs(p.vx) + Math.abs(p.vy) > 0.03;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        // Reference-style typographic marks, without eyeballs or pupils.
        ctx.save();
        ctx.fillStyle = i % 6 === 4 ? "#fff" : "#111";
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(2, p.r * 0.055);
        const attention =
          Math.max(-1, Math.min(1, (point.x - p.x) / Math.max(w, 1))) *
          p.r *
          0.045;
        const glyphs = ["−", "+", ">", "O", "∧", "∗"],
          left = glyphs[i % 6],
          right = i % 6 === 2 ? "<" : left;
        ctx.font = `${i % 6 === 4 ? 400 : 700} ${p.r * (i % 6 === 2 ? 0.65 : 0.62)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(left, p.x - p.r * 0.42 + attention, p.y + p.r * 0.04);
        ctx.fillText(right, p.x + p.r * 0.42 + attention, p.y + p.r * 0.04);
        ctx.restore();
      }
      if (!paused && !reduced.matches && moving && visible && !document.hidden)
        frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (visible && !document.hidden) draw();
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = bottom ? 12 : 6;
      entranceStart = 0;
      dots = Array.from({ length: count }, (_, i) => {
        const r = bottom
          ? Math.min(35, (w / count) * 0.43) * (i % 3 === 1 ? 0.6 : 1)
          : Math.min(w * 0.245, h * 0.24) * [0.7, 0.85, 1, 0.86, 0.48, 0.53][i];
        const hx = bottom
          ? ((i + 0.5) * w) / count
          : [0.66, 0.76, 0.35, 0.26, 0.62, 0.77][i] * w;
        const hy = bottom ? h * 0.56 : [0.2, 0.48, 0.4, 0.72, 0.7, 0.85][i] * h;
        return {
          x: hx,
          y: paused || reduced.matches ? hy : -r * (i + 2),
          hx,
          hy,
          r,
          vx: 0,
          vy: 0,
          startY: -r * (i + 2),
        };
      });
      restart();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && !e.buttons) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left,
        y = e.clientY - r.top;
      point.x = x >= 0 && x <= w && y >= 0 && y <= h ? x : -9999;
      point.y = point.x === -9999 ? -9999 : y;
      restart();
    };
    const leave = () => {
      point.x = point.y = -9999;
      restart();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      restart();
    });
    intersection.observe(canvas);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    window.addEventListener("pointerup", leave, { passive: true });
    window.addEventListener("pointercancel", leave, { passive: true });
    document.addEventListener("visibilitychange", restart);
    reduced.addEventListener("change", restart);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("pointerup", leave);
      window.removeEventListener("pointercancel", leave);
      document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart);
    };
  }, [paused, bottom]);
  return (
    <canvas
      ref={ref}
      className={bottom ? "bottom-dots" : "hero-dots"}
      aria-hidden="true"
    />
  );
}
