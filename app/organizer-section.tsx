"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { organizerEntry } from "../lib/organizer-motion";
import Dots from "./dots";

export const organizerHosts = [
  {
    name: "Parampreet Singh",
    role: "Codex Ambassador",
    handle: "Param3021",
    color: "#F16D00",
    ink: "#111515",
  },
  {
    name: "Shivay Lamba",
    role: "Codex Ambassador",
    handle: "HowDevelop",
    color: "#006AFE",
    ink: "#FFFFFF",
  },
  {
    name: "Nikhil Shukla",
    role: "Codex Ambassador",
    handle: "nikhilsbuilds",
    color: "#924FF7",
    ink: "#FFFFFF",
  },
  {
    name: "Shresth Shukla",
    role: "Cerebras Ambassador",
    handle: "callmeshuklaji",
    color: "#262626",
    ink: "#FFFFFF",
  },
] as const;

export default function OrganizerSection({ paused }: { paused: boolean }) {
  const root = useRef<HTMLElement>(null);
  const seen = useRef(new Set<number>());
  const [showDots, setShowDots] = useState(false);
  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const scene = section.querySelector<HTMLElement>(".organizer-scene")!;
    const slots = [...section.querySelectorAll<HTMLElement>(".organizer-slot")];
    const units = [...section.querySelectorAll<HTMLElement>(".organizer-unit")];
    const portrait = matchMedia(
      "(max-width: 740px), (max-width: 1099px) and (orientation: portrait)",
    );
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Map<number, Animation>();
    const visible = new Set<number>();
    let sceneVisible = false;
    const stop = (index: number) => {
      animations.get(index)?.cancel();
      animations.delete(index);
    };
    const stopAll = () => units.forEach((_, index) => stop(index));
    const start = (index: number) => {
      if (
        seen.current.has(index) ||
        paused ||
        reduced.matches ||
        document.hidden
      )
        return;
      const unit = units[index];
      if (!unit.animate) return;
      const bounds = unit.getBoundingClientRect();
      const entry = organizerEntry(
        portrait.matches,
        index,
        bounds.width,
        bounds.height,
      );
      const animation = unit.animate(
        [
          { transform: `translate3d(${entry.x}px, ${entry.y}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: entry.duration,
          delay: entry.delay,
          easing: "cubic-bezier(0.22,1,0.36,1)",
          fill: "backwards",
        },
      );
      seen.current.add(index);
      animations.set(index, animation);
      animation.finished.then(
        () => animations.delete(index),
        () => undefined,
      );
    };
    const update = () => {
      setShowDots(!portrait.matches);
      if (paused || reduced.matches) {
        units.forEach((_, index) => seen.current.add(index));
        stopAll();
      } else if (document.hidden) stopAll();
      else if (portrait.matches) visible.forEach(start);
      else if (sceneVisible) units.forEach((_, index) => start(index));
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === scene) {
            sceneVisible = entry.isIntersecting;
            if (!entry.isIntersecting && !portrait.matches) stopAll();
          } else {
            const index = slots.indexOf(entry.target as HTMLElement);
            if (entry.isIntersecting) visible.add(index);
            else {
              visible.delete(index);
              if (portrait.matches) stop(index);
            }
          }
        }
        update();
      },
      { threshold: 0.12 },
    );
    observer.observe(scene);
    slots.forEach((slot) => observer.observe(slot));
    const resize = () => {
      stopAll();
      update();
    };
    const focus = () => {
      units.forEach((_, index) => seen.current.add(index));
      stopAll();
    };
    portrait.addEventListener("change", resize);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    section.addEventListener("focusin", focus);
    update();
    return () => {
      observer.disconnect();
      stopAll();
      portrait.removeEventListener("change", resize);
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      section.removeEventListener("focusin", focus);
    };
  }, [paused]);
  return (
    <section
      className="organizers organizer-tubes"
      ref={root}
      aria-labelledby="organizer-heading"
    >
      <header className="organizer-heading-row">
        <h2 id="organizer-heading">Meet the Organizers behind</h2>
        <div className="organizer-heading-dots" aria-hidden="true">
          {showDots && <Dots paused={paused} />}
        </div>
      </header>
      <div className="organizer-scene">
        <ul className="organizer-list">
          {organizerHosts.map((host, index) => (
            <li
              className="organizer-slot"
              key={host.handle}
              data-origin={index % 2 === 0 ? "left" : "right"}
              style={
                {
                  "--organizer-color": host.color,
                  "--organizer-ink": host.ink,
                } as CSSProperties
              }
            >
              <a
                className="organizer-unit"
                href={`https://x.com/${host.handle}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="organizer-surface" aria-hidden="true" />
                <span className="organizer-portrait-ring">
                  <img
                    className="organizer-photo"
                    src={`/organizers/${host.handle}-x.jpg`}
                    alt={host.name}
                    width={200}
                    height={200}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="organizer-labels">
                  <strong className="organizer-name">{host.name}</strong>
                  <span className="organizer-role">{host.role}</span>
                  {index === 3 && (
                    <span className="organizer-partner">
                      Co-partner: Cerebras
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
