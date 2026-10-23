"use client";
import { useEffect, useRef, useState } from "react";
import { delhiOffset } from "../lib/delhi-motion";
import { loadDelhiMask } from "../lib/delhi-mask";
const base = "/art/delhi-v3/";
type DelhiLayers = { mask: string; fill: string; metro: string };

/** Decode the preferred lossless format before revealing any moving artwork. */
export async function loadDelhiLayer(name: string, signal: AbortSignal) {
  for (const extension of ["webp", "png"]) {
    signal.throwIfAborted();
    const src = base + name + "." + extension;
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          if (typeof image.decode === "function")
            image.decode().then(resolve, reject);
          else resolve();
        };
        image.onerror = () => reject(new Error("Artwork unavailable"));
        image.src = src;
      });
      signal.throwIfAborted();
      return src;
    } catch (error) {
      signal.throwIfAborted();
      if (extension === "png") throw error;
    }
  }
  throw new Error("Artwork unavailable");
}
export default function DelhiWordmark({
  paused = false,
}: {
  paused?: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null),
    fill = useRef<HTMLImageElement>(null),
    layerLoad = useRef<Promise<DelhiLayers> | null>(null),
    controller = useRef<AbortController | null>(null);
  const [active, setActive] = useState(false),
    [maskUrl, setMaskUrl] = useState<string | null>(null),
    [layerSources, setLayerSources] = useState({ fill: "", metro: "" }),
    [fallbackFailed, setFallbackFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => {
      abort.abort();
      layerLoad.current = null;
    };
  }, []);
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
        const signal = controller.current!.signal;
        const mask = loadDelhiMask(signal, base + "text-mask-alpha.webp").catch(
          () => {
            signal.throwIfAborted();
            return loadDelhiMask(signal);
          },
        );
        layerLoad.current = Promise.all([
          mask,
          loadDelhiLayer("delhi-fill-overscan", signal),
          loadDelhiLayer("metro-static", signal),
        ]).then(
          ([readyMask, fill, metro]) => ({ mask: readyMask.url, fill, metro }),
          (error) => {
            void mask.then(
              (readyMask) => readyMask.dispose(),
              () => undefined,
            );
            throw error;
          },
        );
      }
      layerLoad.current.then(
        (layers) => {
          if (alive) {
            setLayerSources({ fill: layers.fill, metro: layers.metro });
            setMaskUrl(layers.mask);
          }
        },
        () => {
          if (alive) {
            setMaskUrl(null);
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
    setMaskUrl(null);
    setActive(false);
    layerLoad.current = null;
  };
  const motion = active && !!maskUrl && !paused;
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
        <picture>
          {!fallbackFailed && (
            <source
              type="image/webp"
              srcSet={base + "fallback-approved-v3.webp"}
            />
          )}
          <img
            className="delhi-fallback"
            src={base + "fallback-approved-v3.png"}
            width={2048}
            height={768}
            alt=""
            fetchPriority="high"
            onError={() => setFallbackFailed(true)}
          />
        </picture>
        {motion && (
          <>
            <span
              className="delhi-mask"
              style={{
                maskImage: `url("${maskUrl}")`,
                WebkitMaskImage: `url("${maskUrl}")`,
              }}
            >
              <picture>
                {layerSources.fill.endsWith(".webp") && (
                  <source type="image/webp" srcSet={layerSources.fill} />
                )}
                <img
                  ref={fill}
                  onError={showFallback}
                  className="delhi-fill"
                  src={base + "delhi-fill-overscan.png"}
                  alt=""
                  width={2112}
                  height={832}
                />
              </picture>
            </span>
            <picture>
              {layerSources.metro.endsWith(".webp") && (
                <source type="image/webp" srcSet={layerSources.metro} />
              )}
              <img
                onError={showFallback}
                className="delhi-metro"
                src={base + "metro-static.png"}
                alt=""
                width={2048}
                height={768}
              />
            </picture>
          </>
        )}
      </span>
    </span>
  );
}
