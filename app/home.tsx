"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Dots from "./dots";
import DelhiWordmark from "./delhi-wordmark";
import { defaultPublicContent } from "../lib/event-content-contract";
import {
  agendaDestination,
  agendaGeometry,
  confirmedAgenda,
  stackGeometry,
} from "./home-geometry";
type Content = typeof defaultPublicContent;
const faqs = [
  [
    "Does Luma confirm my place?",
    "Luma is for registration. Your place is confirmed only when your status is Going on this portal.",
  ],
  [
    "Must every teammate register?",
    "Yes. Every member must register individually on Luma and have their own portal profile.",
  ],
  [
    "How big can a team be?",
    "You can build solo or in a team of up to five members.",
  ],
  [
    "Can I join without a team?",
    "Yes. You can participate solo or meet other builders through Discover.",
  ],
  [
    "What should I bring?",
    "Bring your laptop, charger and what you need for a day of building.",
  ],
  [
    "Can I submit an existing project?",
    "Build your hackathon work during the event. Check the Rules page for the full submission requirements.",
  ],
  [
    "Where will I see event updates?",
    "Check your Dashboard and the event registration page for updates from the organizers.",
  ],
];
const hosts = [
  ["Parampreet Singh", "Codex Ambassador", "Param3021"],
  ["Shivay Lamba", "Codex Ambassador", "HowDevelop"],
  ["Nikhil Shukla", "Codex Ambassador", "nikhilsbuilds"],
  ["Shresth Shukla", "Cerebras Ambassador", "callmeshuklaji"],
];
function Chapters({
  items,
  paused,
}: {
  items: Content["agenda"];
  paused: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    track = useRef<HTMLOListElement>(null);
  const geometry = useRef({ start: 0, distance: 0, offsets: [] as number[] });
  const [list, setList] = useState(false),
    [step, setStep] = useState(0);
  const agenda = confirmedAgenda(items);
  useEffect(() => {
    const node = root.current,
      rail = track.current;
    if (!node) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const chapters = [...node.querySelectorAll<HTMLElement>(".chapter")];
    let frame = 0,
      measureFrame = 0,
      alive = true,
      initialized = false,
      activeStep = -1;
    const paint = () => {
      frame = 0;
      if (!rail || node.dataset.agenda !== "true") return;
      const { start, distance, offsets } = geometry.current;
      const { translation } = agendaGeometry(start, distance, scrollY);
      rail.style.transform = `translate3d(${translation}px,0,0)`;
      const position = -translation;
      let index = 0;
      offsets.forEach((offset, i) => {
        if (position >= Math.min(offset, distance) - 2) index = i;
      });
      if (activeStep !== index) {
        activeStep = index;
        setStep(index);
      }
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const measure = () => {
      measureFrame = 0;
      if (!alive) return;
      const previous = node.dataset.enhanced === "true";
      const anchor =
        initialized && node.getBoundingClientRect().top < 0
          ? [...chapters].reverse().find((chapter) => {
              const rect = chapter.getBoundingClientRect();
              return rect.top < innerHeight && rect.bottom > 60;
            })
          : undefined;
      const anchorTop = anchor?.getBoundingClientRect().top;
      const horizontal =
        !list &&
        !paused &&
        !reduced.matches &&
        innerWidth >= 768 &&
        innerHeight >= 620 &&
        agenda.length > 1;
      node.dataset.agenda = String(horizontal);
      const natural = chapters.map(
        (chapter) =>
          chapter.querySelector<HTMLElement>(".chapter-content")!.scrollHeight,
      );
      const layout = stackGeometry(
        innerWidth,
        innerHeight,
        natural,
        paused || reduced.matches,
      );
      node.dataset.enhanced = String(layout.enabled);
      node.dataset.agenda = String(layout.enabled && horizontal);
      chapters.forEach((chapter, i) => {
        chapter.style.setProperty("--chapter-top", `${layout.tops[i]}px`);
        chapter.style.setProperty("--chapter-stage", `${layout.stages[i]}px`);
      });
      const windowNode = rail?.parentElement;
      const distance =
        layout.enabled && horizontal && rail && windowNode
          ? Math.max(0, rail.scrollWidth - windowNode.clientWidth)
          : 0;
      node.style.setProperty("--agenda-travel", `${distance}px`);
      geometry.current = {
        start: node.getBoundingClientRect().top + scrollY - layout.tops[0],
        distance,
        offsets: rail
          ? [...rail.children].map((child) => (child as HTMLElement).offsetLeft)
          : [],
      };
      if (rail && !distance) rail.style.transform = "";
      if (
        initialized &&
        previous !== layout.enabled &&
        anchor &&
        anchorTop !== undefined
      ) {
        window.scrollBy({
          top: anchor.getBoundingClientRect().top - anchorTop,
          behavior: "instant",
        });
      }
      initialized = true;
      paint();
    };
    const queueMeasure = () => {
      if (!measureFrame) measureFrame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(queueMeasure);
    chapters.forEach((chapter) =>
      resize.observe(chapter.querySelector(".chapter-content")!),
    );
    if (rail?.parentElement) resize.observe(rail.parentElement);
    window.addEventListener("resize", queueMeasure);
    window.addEventListener("scroll", scroll, { passive: true });
    node.addEventListener("toggle", queueMeasure, true);
    reduced.addEventListener("change", queueMeasure);
    document.fonts.ready.then(() => {
      if (alive) queueMeasure();
    });
    measure();
    return () => {
      alive = false;
      resize.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(measureFrame);
      window.removeEventListener("resize", queueMeasure);
      window.removeEventListener("scroll", scroll);
      node.removeEventListener("toggle", queueMeasure, true);
      reduced.removeEventListener("change", queueMeasure);
    };
  }, [items, paused, list]);
  const go = (index: number) => {
    if (root.current?.dataset.agenda === "true") {
      const { start, distance, offsets } = geometry.current;
      window.scrollTo({
        top: agendaDestination(start, distance, offsets[index] || 0),
        behavior: "instant",
      });
    } else
      document
        .getElementById(`agenda-${index}`)
        ?.scrollIntoView({ block: "nearest", behavior: "instant" });
    setStep(index);
  };
  const heading = (index: number, name: string) => (
    <header className="chapter-heading">
      <span className="chapter-number">0{index + 1}</span>
      <h2>{name}</h2>
    </header>
  );
  return (
    <div className="chapter-stack" ref={root}>
      <section
        id="schedule"
        className="chapter"
        style={{ "--chapter-index": 0 } as CSSProperties}
      >
        <div className="chapter-content">
          {heading(0, "Schedule")}
          <div className="chapter-body schedule-body">
            <p className="event-day">Sunday, 1 November 2026</p>
            <h3>
              08:00 - 20:00 <span>IST</span>
            </h3>
            {agenda.length ? (
              <>
                <div className="agenda-window">
                  <ol className="agenda-track" ref={track}>
                    {agenda.map((item, index) => (
                      <li key={index} id={`agenda-${index}`}>
                        <span className="eyebrow">{item.time}</span>
                        <h4>{item.title}</h4>
                        <p>{item.description}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                {agenda.length > 1 && (
                  <div className="agenda-controls">
                    <button
                      className="button secondary"
                      disabled={step === 0}
                      onClick={() => go(Math.max(0, step - 1))}
                    >
                      Previous
                    </button>
                    <button
                      className="button secondary"
                      disabled={step === agenda.length - 1}
                      onClick={() => go(Math.min(agenda.length - 1, step + 1))}
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
              </>
            ) : (
              <p className="agenda-pending">Agenda to follow</p>
            )}
          </div>
        </div>
      </section>
      <div className="agenda-duration" aria-hidden="true" />
      <section
        id="venue"
        className="chapter"
        style={{ "--chapter-index": 1 } as CSSProperties}
      >
        <div className="chapter-content">
          {heading(1, "Venue")}
          <div className="chapter-body venue-body">
            <h3>IIIT Delhi</h3>
            <p>New Delhi</p>
          </div>
        </div>
      </section>
      <section
        id="rules"
        className="chapter"
        style={{ "--chapter-index": 2 } as CSSProperties}
      >
        <div className="chapter-content">
          {heading(2, "Rules")}
          <ol className="public-rules">
            <li>Register on Luma</li>
            <li>Every member registers</li>
            <li>Up to five per team</li>
            <li>Entry requires Going on portal</li>
          </ol>
        </div>
      </section>
      <section
        id="faq"
        className="chapter"
        style={{ "--chapter-index": 3 } as CSSProperties}
      >
        <div className="chapter-content">
          {heading(3, "FAQ")}
          <div className="chapter-body public-faq">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
export default function Home({
  content = defaultPublicContent,
  signedIn = false,
}: {
  content?: Content;
  signedIn?: boolean;
  submissionClose?: string | null;
}) {
  const [paused, setPaused] = useState(false),
    [ready, setReady] = useState(false),
    [visible, setVisible] = useState(true),
    [bubble, setBubble] = useState("");
  const hero = useRef<HTMLElement>(null),
    lastBubble = useRef("");
  useEffect(() => {
    try {
      setPaused(localStorage.getItem("portal-pause-motion") === "true");
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!hero.current) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(hero.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>,
      stopped = false;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const schedule = () => {
      if (
        stopped ||
        paused ||
        !ready ||
        !visible ||
        media.matches ||
        document.hidden
      )
        return;
      timer = setTimeout(
        () => {
          if (innerWidth >= 1000 && innerHeight >= 700) {
            const lines = [
              "Ready to build?",
              "Let’s build!",
              "Ship something fun.",
            ].filter((line) => line !== lastBubble.current);
            const line = lines[Math.floor(Math.random() * lines.length)];
            lastBubble.current = line;
            setBubble(line);
            timer = setTimeout(() => {
              setBubble("");
              schedule();
            }, 3000);
          } else schedule();
        },
        14000 + Math.random() * 8000,
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
    <div className="home" data-paused={paused}>
      <section className="home-hero" aria-labelledby="home-title" ref={hero}>
        <div className="hero-copy">
          <h1
            id="home-title"
            aria-label="DevDay Exchange Community Hackathon: New Delhi"
          >
            <span className="hero-title-lines" aria-hidden="true">
              <span>DevDay Exchange</span>
              <span>Community Hackathon:</span>
            </span>
            <span className="sr-only">New Delhi</span>
            <DelhiWordmark paused={paused || !ready || !visible} />
          </h1>
          <p className="hero-date">Sunday, 1 November 2026</p>
          <a
            className="hero-register"
            href="https://luma.com/6t5uk4lo"
            target="_blank"
            rel="noopener noreferrer"
          >
            Register <span aria-hidden="true">↗</span>
          </a>
          <a
            className="button primary-cta"
            href={
              signedIn
                ? "/dashboard"
                : "/signin-with-chatgpt?return_to=%2Fdashboard"
            }
            target="_top"
          >
            {signedIn ? "Open your Dashboard" : "Continue with ChatGPT"}
            <span aria-hidden="true">→</span>
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <Dots paused={paused || !ready} />
          {bubble && <span className="speech-bubble">{bubble}</span>}
        </div>
        <div className="home-motion-strip">
          <Dots paused={paused || !ready} bottom />
        </div>
        <a
          className="scroll-cue"
          href="#schedule"
          aria-label="Scroll to schedule"
        >
          <span aria-hidden="true">↓</span>
        </a>
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
      </section>
      <Chapters items={content.agenda} paused={paused} />
      <section className="organizers">
        <h2>Meet the Organizers behind</h2>
        <ul className="host-badges">
          {hosts.map(([name, role, handle]) => (
            <li key={handle}>
              <a
                href={`https://x.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="host-photo"
                  src={`/organizers/${handle}-x.jpg`}
                  width={200}
                  height={200}
                  alt={name}
                  loading="lazy"
                  decoding="async"
                />
                <span className="host-name">{name}</span>
                <small>{role}</small>
                <span className="host-handle">
                  @{handle} <span aria-hidden="true">↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="partner-note">
          Community partner <strong>Cerebras</strong>
        </p>
      </section>
      <footer className="home-footer">
        <a
          href="https://luma.com/6t5uk4lo"
          target="_blank"
          rel="noopener noreferrer"
        >
          Event registration on Luma <span aria-hidden="true">↗</span>
        </a>
        <a href="#home-title">Back to top ↑</a>
      </footer>
    </div>
  );
}
