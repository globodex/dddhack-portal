"use client";
import { useEffect, useRef, useState } from "react";
import { delhiOffset } from "../lib/delhi-motion";
const base = "/art/delhi-v3/";
export default function DelhiWordmark({
  paused = false,
}: {
  paused?: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null),
    fill = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const media = matchMedia(
      "(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)",
    );
    let alive = true;
    const images = [
      "text-mask-alpha.png",
      "delhi-fill-overscan.png",
      "metro-static.png",
    ].map(
      (src) =>
        new Promise<void>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve();
          i.onerror = () => reject();
          i.src = base + src;
        }),
    );
    Promise.all(images)
      .then(() => {
        if (alive) setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(false);
      });
    const reset = () => {
      setActive(
        !media.matches && !paused && CSS.supports("mask-image", "url('x.png')"),
      );
      if (fill.current) fill.current.style.transform = "translate(0px, 0px)";
    };
    reset();
    media.addEventListener("change", reset);
    const observer = new ResizeObserver(() => {
      if (fill.current) fill.current.style.transform = "translate(0px, 0px)";
    });
    if (root.current) observer.observe(root.current);
    return () => {
      alive = false;
      observer.disconnect();
      media.removeEventListener("change", reset);
    };
  }, [paused]);
  return (
    <span
      ref={root}
      className="delhi-wordmark"
      aria-hidden="true"
      data-motion={active && loaded}
      onPointerMove={(e) => {
        if (!active || !loaded || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        const p = delhiOffset(
          e.clientX - r.left,
          e.clientY - r.top,
          r.width,
          r.height,
        );
        if (fill.current)
          fill.current.style.transform = `translate(${(p.x * 2048) / 1927}px,${(p.y * 2048) / 1927}px)`;
      }}
      onPointerLeave={() => {
        if (fill.current) fill.current.style.transform = "translate(0px,0px)";
      }}
    >
      <span className="delhi-canvas">
        <img
          className="delhi-fallback"
          src={base + "fallback-approved-v3.png"}
          width={2048}
          height={768}
          alt=""
          fetchPriority="high"
        />
        <span className="delhi-mask">
          <img
            ref={fill}
            className="delhi-fill"
            src={base + "delhi-fill-overscan.png"}
            alt=""
            width={2112}
            height={832}
          />
        </span>
        <img
          className="delhi-metro"
          src={base + "metro-static.png"}
          alt=""
          width={2048}
          height={768}
        />
      </span>
    </span>
  );
}
