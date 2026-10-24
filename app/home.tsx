"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Pause,
  Play,
  Plus,
  Minus,
} from "lucide-react";
import Dots from "./dots";
import DelhiWordmark from "./delhi-wordmark";
import OrganizerSection from "./organizer-section";
import PortraitBackdrop from "./portrait-backdrop";
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
// The portrait layout is still under design review. Do not mount extra motion
// fields there, or turn the approved desktop decoration into a mobile layout.
function ChapterDecoration({ paused }: { paused: boolean }) {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = matchMedia("(min-width: 741px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <div className="chapter-decoration" aria-hidden="true">
      {desktop && <Dots paused={paused} />}
    </div>
  );
}
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
      const publicHeader =
        document.querySelector<HTMLElement>(".public-header");
      const headerHeight =
        publicHeader && getComputedStyle(publicHeader).position === "sticky"
          ? publicHeader.getBoundingClientRect().height
          : 0;
      const layout = stackGeometry(
        innerWidth,
        innerHeight - headerHeight,
        natural,
        paused || reduced.matches,
      );
      node.dataset.enhanced = String(layout.enabled);
      node.dataset.agenda = String(layout.enabled && horizontal);
      chapters.forEach((chapter, i) => {
        chapter.style.setProperty(
          "--chapter-top",
          `${layout.tops[i] + headerHeight}px`,
        );
        chapter.style.setProperty("--chapter-stage", `${layout.stages[i]}px`);
      });
      const windowNode = rail?.parentElement;
      const distance =
        layout.enabled && horizontal && rail && windowNode
          ? Math.max(0, rail.scrollWidth - windowNode.clientWidth)
          : 0;
      node.style.setProperty("--agenda-travel", `${distance}px`);
      geometry.current = {
        start:
          node.getBoundingClientRect().top +
          scrollY -
          layout.tops[0] -
          headerHeight,
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
              08:00 to 20:00 <span>IST</span>
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
                      <ArrowLeft size={18} aria-hidden="true" /> Previous
                    </button>
                    <button
                      className="button secondary"
                      disabled={step === agenda.length - 1}
                      onClick={() => go(Math.min(agenda.length - 1, step + 1))}
                    >
                      Next <ArrowRight size={18} aria-hidden="true" />
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
          <ChapterDecoration paused={paused} />
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
          <ChapterDecoration paused={paused} />
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
            <li>Every team member must register on Luma.</li>
            <li>Entry requires Going on portal. No +1s.</li>
            <li>Teams may have up to five members.</li>
            <li>Bring your laptop. Be available from 8 AM to 8 PM.</li>
            <li>Submit a new build started for this hackathon.</li>
            <li>Under 18? Parent or guardian permission is required.</li>
            <li>
              Event photography and video may appear on community channels.
            </li>
            <li>
              Submissions: personally checked-in leader only, three committed
              versions.
            </li>
          </ol>
          <ChapterDecoration paused={paused} />
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
            {faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>
                  {question}
                  <Plus
                    className="faq-expand-icon"
                    size={20}
                    aria-hidden="true"
                  />
                  <Minus
                    className="faq-collapse-icon"
                    size={20}
                    aria-hidden="true"
                  />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <ChapterDecoration paused={paused} />
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
      <PortraitBackdrop paused={paused} />
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
          <p className="hero-date">
            Sunday, 1 November 2026 · Hosted by Codex Ambassadors
          </p>
          <div className="hero-actions">
            <a
              className="hero-register"
              href="https://luma.com/6t5uk4lo"
              target="_blank"
              rel="noopener noreferrer"
            >
              Register <ArrowUpRight size={20} aria-hidden="true" />
            </a>
            <a
              className="button primary-cta"
              href={
                signedIn
                  ? "/dashboard"
                  : "/signin?returnTo=%2Fdashboard"
              }
              target="_top"
            >
              {signedIn ? "Open your Dashboard" : "Continue to portal"}
              <ArrowRight size={20} aria-hidden="true" />
            </a>
          </div>
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
          <ArrowDown size={20} aria-hidden="true" />
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
          {paused ? (
            <Play size={20} aria-hidden="true" />
          ) : (
            <Pause size={20} aria-hidden="true" />
          )}
        </button>
      </section>
      <Chapters items={content.agenda} paused={paused} />
      <OrganizerSection paused={paused} />
      <footer className="home-footer">
        <a
          href="https://luma.com/6t5uk4lo"
          target="_blank"
          rel="noopener noreferrer"
        >
          Event registration on Luma{" "}
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
        <a href="#home-title">
          Back to top <ArrowUp size={18} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
