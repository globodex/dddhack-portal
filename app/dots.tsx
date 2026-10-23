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
      previous = 0;
    const point = { x: -9999, y: -9999 };
    const colors = [
      "#0969ff",
      "#d9d9d9",
      "#863fff",
      "#00a251",
      "#ff7900",
      "#202020",
    ];
    let dots: {
      x: number;
      y: number;
      hx: number;
      hy: number;
      r: number;
      vx: number;
      vy: number;
    }[] = [];
    const draw = (time = 0) => {
      if (!alive) return;
      const dt = previous ? Math.min(2, (time - previous) / 16.67) : 1;
      previous = time;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < dots.length; i++) {
        const p = dots[i];
        if (paused || reduced.matches) {
          p.x = p.hx;
          p.y = p.hy;
          p.vx = p.vy = 0;
        } else {
          const dx = p.x - point.x,
            dy = p.y - point.y,
            d = Math.hypot(dx, dy),
            range = bottom ? 90 : 120;
          if (d < range && d > 1) {
            p.vx += (dx / d) * (range - d) * 0.017;
            p.vy += (dy / d) * (range - d) * 0.017;
          }
          p.vx += (p.hx - p.x) * 0.014 * dt;
          p.vy += (p.hy - p.y) * 0.014 * dt;
          p.vx *= 0.87;
          p.vy *= 0.87;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.x = Math.max(p.r, Math.min(w - p.r, p.x));
          p.y = Math.max(-h, Math.min(h - p.r, p.y));
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
      }
      if (!paused && !reduced.matches && visible && !document.hidden)
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
      const count = bottom ? 12 : 8;
      dots = Array.from({ length: count }, (_, i) => {
        const r = bottom
          ? Math.min(35, (w / count) * 0.43) * (i % 3 === 1 ? 0.6 : 1)
          : Math.min(w * 0.17, h * 0.15) * (i % 3 === 1 ? 0.48 : 1);
        const hx = bottom
          ? ((i + 0.5) * w) / count
          : [0.25, 0.78, 0.38, 0.77, 0.21, 0.82, 0.59, 0.42][i] * w;
        const hy = bottom
          ? h * 0.56
          : [0.32, 0.15, 0.59, 0.5, 0.77, 0.82, 0.31, 0.87][i] * h;
        return {
          x: hx,
          y: paused || reduced.matches ? hy : -r * (i + 2),
          hx,
          hy,
          r,
          vx: 0,
          vy: 0,
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
    };
    const leave = () => {
      point.x = point.y = -9999;
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
