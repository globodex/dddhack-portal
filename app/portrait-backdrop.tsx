"use client";
import { useEffect, useRef, useState } from "react";
import DotAvatar from "./dot-avatar";
import {
  backdropRepulsion,
  portraitDotPool,
  portraitPile,
} from "../lib/portrait-backdrop";

export default function PortraitBackdrop({ paused }: { paused: boolean }) {
  const [portrait, setPortrait] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia("(max-width: 1099px) and (orientation: portrait)");
    const update = () => setPortrait(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const node = root.current;
    const home = node?.closest<HTMLElement>(".home");
    if (!node || !home || !portrait) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const elements = [
      ...node.querySelectorAll<HTMLElement>(".portrait-backdrop-dot"),
    ];
    home.dataset.portraitBackdrop = "true";
    let width = innerWidth,
      height = innerHeight,
      progress = 0,
      frame = 0,
      lastFrame = 0;
    let dirty = true,
      visible = true,
      initialized = false,
      stable = paused || reduced.matches;
    let pointer: { x: number; y: number } | null = null;
    let state = portraitPile(width, height, 0);
    let positions = state.dots.map((dot) => ({ x: dot.x, y: dot.y }));
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      node.dataset.moving = "false";
    };
    const measure = () => {
      width = innerWidth;
      height = innerHeight;
      if (!stable || !initialized) {
        const start = home.getBoundingClientRect().top + scrollY;
        const end = home
          .querySelector(".organizers")
          ?.getBoundingClientRect().top;
        const endY =
          end === undefined
            ? home.getBoundingClientRect().bottom + scrollY - height
            : end + scrollY - height * 0.2;
        progress = Math.max(
          0,
          Math.min(1, (scrollY - start) / Math.max(1, endY - start)),
        );
      }
      state = portraitPile(width, height, progress);
      node.dataset.count = String(state.count);
      node.dataset.progress = state.progress.toFixed(3);
      node.dataset.fillHeight = state.fillHeight.toFixed(1);
      state.dots.forEach((dot, index) => {
        const element = elements[index];
        element.style.visibility = dot.active ? "visible" : "hidden";
        element.style.width = element.style.height = `${dot.diameter}px`;
        if (!initialized || stable) positions[index] = { x: dot.x, y: dot.y };
      });
      initialized = true;
      dirty = false;
    };
    const paint = () => {
      let moving = false;
      state.dots.forEach((dot, index) => {
        if (!dot.active) return;
        const offset = stable
          ? { x: 0, y: 0 }
          : backdropRepulsion(dot.x, dot.y, pointer);
        const targetX = Math.max(
          dot.diameter / 2,
          Math.min(width - dot.diameter / 2, dot.x + offset.x),
        );
        const targetY = Math.max(
          dot.diameter / 2,
          Math.min(height - dot.diameter / 2, dot.y + offset.y),
        );
        const position = positions[index];
        if (stable) {
          position.x = targetX;
          position.y = targetY;
        } else {
          position.x += (targetX - position.x) * 0.25;
          position.y += (targetY - position.y) * 0.25;
        }
        const distance = Math.hypot(targetX - position.x, targetY - position.y);
        if (distance < 0.2) {
          position.x = targetX;
          position.y = targetY;
        } else moving = true;
        elements[index].style.transform =
          `translate3d(${(position.x - dot.diameter / 2).toFixed(2)}px, ${(position.y - dot.diameter / 2).toFixed(2)}px, 0) rotate(${dot.angle.toFixed(2)}deg)`;
      });
      node.dataset.moving = String(moving && !stable);
      return moving;
    };
    const draw = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (now - lastFrame < 1000 / 30 - 0.5) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastFrame = now;
      if (dirty) measure();
      if (paint() && !stable) frame = requestAnimationFrame(draw);
    };
    const schedule = () => {
      if (!frame && visible && !document.hidden)
        frame = requestAnimationFrame(draw);
    };
    const scroll = () => {
      if (stable) return;
      dirty = true;
      schedule();
    };
    const resize = () => {
      dirty = true;
      schedule();
    };
    const move = (event: PointerEvent) => {
      if (
        stable ||
        (event.pointerType === "touch" && event.type !== "pointerdown")
      )
        return;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const leave = () => {
      if (!pointer) return;
      pointer = null;
      if (!stable) schedule();
    };
    const policy = () => {
      stable = paused || reduced.matches;
      pointer = null;
      dirty = true;
      if (document.hidden) stop();
      else schedule();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        dirty = true;
        schedule();
      } else stop();
    });
    observer.observe(home);
    const size = new ResizeObserver(resize);
    size.observe(home);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    window.addEventListener("pointerup", leave, { passive: true });
    window.addEventListener("pointercancel", leave, { passive: true });
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", policy);
    reduced.addEventListener("change", policy);
    measure();
    paint();
    return () => {
      stop();
      observer.disconnect();
      size.disconnect();
      delete home.dataset.portraitBackdrop;
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("pointerup", leave);
      window.removeEventListener("pointercancel", leave);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", policy);
      reduced.removeEventListener("change", policy);
    };
  }, [portrait, paused]);
  return portrait ? (
    <div className="portrait-backdrop" ref={root} aria-hidden="true">
      {portraitDotPool.map((dot, index) => (
        <span className="portrait-backdrop-dot" key={index}>
          <DotAvatar
            color={dot.color}
            expression={dot.expression}
            size={80}
            decorative
          />
        </span>
      ))}
    </div>
  ) : null;
}
