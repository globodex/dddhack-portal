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
    fill = useRef<HTMLImageElement>(null),
    layerLoad = useRef<Promise<void> | null>(null);
  const [active, setActive] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const media = matchMedia(
      "(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)",
    );
    let alive = true;
    const resetFill = () => {
      if (fill.current) fill.current.style.transform = "translate(0px, 0px)";
    };
    const update = () => {
      const eligible =
        !media.matches &&
        !paused &&
        typeof CSS !== "undefined" &&
        (CSS.supports("mask-image", "url('x.png')") ||
          CSS.supports("-webkit-mask-image", "url('x.png')"));
      setActive(eligible);
      resetFill();
      if (!eligible) return;
      // Static SSR/first paint stays visible. Coarse/reduced devices never request
      // the motion artwork; eligible devices reveal it only after every decode.
      if (!layerLoad.current) {
        layerLoad.current = Promise.all(
          [
            "text-mask-alpha.png",
            "delhi-fill-overscan.png",
            "metro-static.png",
          ].map(
            (src) =>
              new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                  if (typeof image.decode === "function")
                    image.decode().then(resolve, reject);
                  else resolve();
                };
                image.onerror = () => reject(new Error("Artwork unavailable"));
                image.src = base + src;
              }),
          ),
        ).then(() => undefined);
      }
      layerLoad.current.then(
        () => {
          if (alive) setLoaded(true);
        },
        () => {
          if (alive) {
            setLoaded(false);
            setActive(false);
          }
          layerLoad.current = null;
        },
      );
    };
    update();
    media.addEventListener("change", update);
    const observer = new ResizeObserver(resetFill);
    if (root.current) observer.observe(root.current);
    return () => {
      alive = false;
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, [paused]);
  const showFallback = () => {
    setLoaded(false);
    setActive(false);
    layerLoad.current = null;
  };
  const motion = active && loaded && !paused;
  return (
    <span
      ref={root}
      className="delhi-wordmark"
      aria-hidden="true"
      data-motion={motion}
      onPointerMove={(e) => {
        if (!motion || e.pointerType !== "mouse") return;
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
        {motion && (
          <>
            <span className="delhi-mask">
              <img
                ref={fill}
                onError={showFallback}
                className="delhi-fill"
                src={base + "delhi-fill-overscan.png"}
                alt=""
                width={2112}
                height={832}
              />
            </span>
            <img
              onError={showFallback}
              className="delhi-metro"
              src={base + "metro-static.png"}
              alt=""
              width={2048}
              height={768}
            />
          </>
        )}
      </span>
    </span>
  );
}
