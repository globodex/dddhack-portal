"use client";
import { useEffect, useRef, useState } from "react";
import Dots from "./dots";
import DelhiWordmark from "./delhi-wordmark";
import { ist } from "../lib/time";
import { defaultPublicContent } from "../lib/event-content-contract";
type Content = typeof defaultPublicContent;
function Agenda({
  items,
  paused,
}: {
  items: Content["agenda"];
  paused: boolean;
}) {
  const section = useRef<HTMLElement>(null),
    track = useRef<HTMLOListElement>(null);
  const [step, setStep] = useState(0),
    [list, setList] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const s = section.current,
        t = track.current;
      if (!s || !t) return;
      const active =
        !paused &&
        !list &&
        !media.matches &&
        innerWidth >= 1000 &&
        innerHeight >= 700 &&
        items.length > 1;
      s.dataset.scroll = String(active);
      if (!active) {
        t.style.transform = "";
        return;
      }
      const r = s.getBoundingClientRect(),
        progress = Math.max(
          0,
          Math.min(1, -r.top / Math.max(1, r.height - innerHeight)),
        );
      t.style.transform = `translateX(${-progress * Math.max(0, t.scrollWidth - t.parentElement!.clientWidth)}px)`;
      setStep(Math.round(progress * (items.length - 1)));
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    media.addEventListener("change", update);
    update();
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      media.removeEventListener("change", update);
    };
  }, [items.length, paused, list]);
  const go = (i: number) => {
    const s = section.current;
    if (!s) return;
    if (s.dataset.scroll === "true") {
      const top = s.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top:
          top +
          ((s.offsetHeight - innerHeight) * i) / Math.max(1, items.length - 1),
        behavior: "auto",
      });
    } else {
      document
        .getElementById(`agenda-${i}`)
        ?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
    setStep(i);
  };
  return (
    <section ref={section} className="agenda-chapter" id="schedule">
      <div className="chapter agenda-inner">
        <header>
          <span className="chapter-number">01</span>
          <h2>Schedule</h2>
          <p>One day. Many possibilities.</p>
        </header>
        <div className="agenda-window">
          <ol ref={track} className="agenda-track">
            {items.map((a, i) => (
              <li id={`agenda-${i}`} key={i}>
                <span className="eyebrow">{a.time}</span>
                <h3>{a.title}</h3>
                <p>{a.description}</p>
              </li>
            ))}
          </ol>
        </div>
        {items.length > 1 && (
          <div className="agenda-controls">
            <button
              className="button secondary"
              onClick={() => go(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              Previous
            </button>
            <button
              className="button secondary"
              onClick={() => go(Math.min(items.length - 1, step + 1))}
              disabled={step >= items.length - 1}
            >
              Next
            </button>
            <button
              className="link-button"
              aria-pressed={list}
              onClick={() => setList(!list)}
            >
              {list ? "Use scroll progression" : "Show normal list"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
export default function Home({
  content = defaultPublicContent,
  signedIn = false,
  submissionClose = "2026-11-01T10:30:00.000Z",
}: {
  content?: Content;
  signedIn?: boolean;
  submissionClose?: string | null;
}) {
  const [paused, setPaused] = useState(false),
    [bubble, setBubble] = useState(""),
    [ready, setReady] = useState(false),
    [visible, setVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null),
    hero = useRef<HTMLElement>(null);
  useEffect(() => {
    try {
      setPaused(localStorage.getItem("portal-pause-motion") === "true");
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    const observed = hero.current;
    if (!observed) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(observed);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>(".stacked");
    if (!nodes) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      nodes.forEach(
        (node) =>
          (node.dataset.pin = String(
            !paused && !media.matches && node.offsetHeight < innerHeight - 120,
          )),
      );
    const observer = new ResizeObserver(update);
    nodes.forEach((node) => observer.observe(node));
    window.addEventListener("resize", update);
    media.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      media.removeEventListener("change", update);
    };
  }, [paused]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const schedule = () => {
      if (stopped || paused || !ready || !visible || media.matches) return;
      timer = setTimeout(
        () => {
          if (innerWidth >= 900 && innerHeight >= 700 && !document.hidden) {
            const lines = [
              "Ready to build?",
              "Let’s build!",
              "Ship something fun.",
            ];
            setBubble(lines[Math.floor(Math.random() * lines.length)]);
            timer = setTimeout(() => {
              setBubble("");
              schedule();
            }, 3500);
          } else schedule();
        },
        12000 + Math.random() * 8000,
      );
    };
    const reset = () => {
      clearTimeout(timer);
      setBubble("");
      schedule();
    };
    reset();
    media.addEventListener("change", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      stopped = true;
      clearTimeout(timer);
      media.removeEventListener("change", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [paused, ready, visible]);
  return (
    <div className="home" ref={root} data-paused={paused}>
      <section className="home-hero" aria-labelledby="home-title" ref={hero}>
        <div className="hero-copy">
          <h1
            id="home-title"
            aria-label="DevDay Exchange Community Hackathon: New Delhi"
          >
            <span aria-hidden="true">
              DevDay
              <br />
              Exchange
              <br />
              Community
              <br />
              Hackathon:
            </span>
            <span className="sr-only">New Delhi</span>
            <DelhiWordmark paused={paused || !ready} />
          </h1>
          <a
            className="button primary-cta"
            href={
              signedIn
                ? "/dashboard"
                : "/signin-with-chatgpt?return_to=%2Fdashboard"
            }
            target="_top"
          >
            {signedIn ? "Open your workspace" : "Continue with ChatGPT"}
            <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <Dots paused={paused || !ready} />
          {bubble && <span className="speech-bubble">{bubble}</span>}
        </div>
        <a
          className="scroll-cue"
          href="#schedule"
          aria-label="Scroll to schedule"
        >
          <span aria-hidden="true">↓</span>
        </a>
      </section>
      <div className="home-motion-strip">
        <Dots paused={paused || !ready} bottom />
        <button
          className="motion-toggle button secondary"
          aria-label={paused ? "Resume animations" : "Pause animations"}
          aria-pressed={paused}
          onClick={() => {
            const next = !paused;
            setPaused(next);
            try {
              localStorage.setItem("portal-pause-motion", String(next));
            } catch {}
          }}
        >
          <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
        </button>
      </div>
      <Agenda
        items={
          content.agenda.length ? content.agenda : defaultPublicContent.agenda
        }
        paused={paused}
      />
      <section id="venue" className="chapter stacked">
        <header>
          <span className="chapter-number">02</span>
          <h2>Venue</h2>
        </header>
        <div className="chapter-body">
          <h3>{content.venue || "Venue to be confirmed"}</h3>
          <p>New Delhi, India</p>
          {content.mapUrl && (
            <a
              className="text-link"
              href={content.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open general venue in Maps
            </a>
          )}
          <p className="muted">
            Exact arrival details are shared privately with teams whose members
            are all approved.
          </p>
        </div>
      </section>
      <section id="rules" className="chapter stacked">
        <header>
          <span className="chapter-number">03</span>
          <h2>Rules</h2>
        </header>
        <div className="chapter-body prose">
          <p>{content.rules}</p>
        </div>
      </section>
      <section id="faq" className="chapter stacked">
        <header>
          <span className="chapter-number">04</span>
          <h2>FAQ</h2>
        </header>
        <div className="chapter-body">
          {content.faqs.map((f, i) => (
            <details key={i}>
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="organizers">
        <h2>Meet the Organizers behind</h2>
        <ul className="host-badges">
          <li>
            <span className="host-monogram" aria-hidden="true">
              PS
            </span>
            <span>
              Parampreet Singh<small>Codex Ambassador</small>
            </span>
          </li>
          <li>
            <span className="host-monogram" aria-hidden="true">
              SL
            </span>
            <span title="Full surname awaiting confirmation">
              Shivay L<small>Codex Ambassador</small>
            </span>
          </li>
          <li>
            <span className="host-monogram" aria-hidden="true">
              NS
            </span>
            <span>
              Nikhil Shukla<small>Codex Ambassador</small>
            </span>
          </li>
          <li>
            <span className="host-monogram" aria-hidden="true">
              SS
            </span>
            <span>
              Shresth Shukla<small>Cerebras Ambassador</small>
            </span>
          </li>
        </ul>
        <p className="partner-note">
          Community partner <strong>Cerebras</strong>
        </p>
      </section>
      <footer className="home-footer">
        Built for people who build.{" "}
        <a
          href="https://luma.com/6t5uk4lo"
          target="_blank"
          rel="noopener noreferrer"
        >
          Event registration on Luma
        </a>
      </footer>
    </div>
  );
}
