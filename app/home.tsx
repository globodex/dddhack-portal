"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
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
import { HeadingDot } from "./expressive-heading";
import { defaultPublicContent } from "../lib/public-content-defaults";
import {
  confirmedAgenda,
  desktopChapterGeometry,
  mobileStackGeometry,
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
function Chapters({
  items,
  paused,
}: {
  items: Content["agenda"];
  paused: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const agenda = confirmedAgenda(items);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const chapters = [...node.querySelectorAll<HTMLElement>(".chapter")];
    let frame = 0,
      alive = true;
    const measure = () => {
      frame = 0;
      if (!alive) return;
      const header = document.querySelector<HTMLElement>(".public-header");
      const headerHeight =
        header && getComputedStyle(header).position === "sticky"
          ? header.getBoundingClientRect().height
          : 0;
      const natural = chapters.map(
        (chapter) =>
          chapter.querySelector<HTMLElement>(".chapter-content")!.scrollHeight,
      );
      const desktop = stackGeometry(
        innerWidth,
        innerHeight - headerHeight,
        natural,
        paused || reduced.matches,
      );
      const mobile = mobileStackGeometry(
        innerWidth,
        innerHeight - headerHeight,
        chapters.map((chapter) => {
          const content = chapter.querySelector<HTMLElement>(".chapter-content")!;
          const style = getComputedStyle(chapter);
          return Math.ceil(
            content.getBoundingClientRect().height +
              parseFloat(style.borderTopWidth) +
              parseFloat(style.borderBottomWidth),
          );
        }),
        paused || reduced.matches,
      );
      const viewportDesktop = desktopChapterGeometry(
        innerWidth,
        innerHeight - headerHeight,
        mobile.stages,
        paused || reduced.matches,
      );
      const layout = mobile.enabled
        ? mobile
        : viewportDesktop.enabled
          ? viewportDesktop
          : desktop;
      node.dataset.enhanced = String(layout.enabled);
      node.dataset.mobileStack = String(mobile.enabled);
      node.dataset.desktopStack = String(viewportDesktop.enabled);
      chapters.forEach((chapter, index) => {
        chapter.style.setProperty(
          "--chapter-top",
          `${layout.tops[index] + headerHeight}px`,
        );
        chapter.style.setProperty(
          "--chapter-stage",
          `${layout.stages[index]}px`,
        );
      });
    };
    const queueMeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(queueMeasure);
    chapters.forEach((chapter) =>
      resize.observe(chapter.querySelector(".chapter-content")!),
    );
    window.addEventListener("resize", queueMeasure);
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
      window.removeEventListener("resize", queueMeasure);
      node.removeEventListener("toggle", queueMeasure, true);
      reduced.removeEventListener("change", queueMeasure);
    };
  }, [items, paused]);
  const colors = ["blue", "green", "orange", "purple"] as const;
  const expressions = ["squeezed", "plus", "sleepy", "round"] as const;
  const heading = (index: number, name: string) => (
    <header className="chapter-heading">
      <h2>
        {name}
        <HeadingDot
          color={colors[index]}
          expression={expressions[index]}
          size={44}
          paused={paused}
        />
      </h2>
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
              <ol className="agenda-timeline">
                {agenda.map((item, index) => (
                  <li key={index} id={`agenda-${index}`}>
                    <time>{item.time}</time>
                    <div>
                      <h4>{item.title}</h4>
                      {item.description && <p>{item.description}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="agenda-pending">Agenda to follow</p>
            )}
          </div>
        </div>
      </section>
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
          <p className="hero-date">
            <span>Sunday, 1 November 2026</span>
            <span className="hero-host">Hosted by Codex Ambassadors</span>
            <span className="hero-partner">
              Co-partner
              <img
                src="/brand/cerebras-official.webp"
                alt="Cerebras"
                width={360}
                height={159}
                decoding="async"
              />
            </span>
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
              href={signedIn ? "/dashboard" : "/signin?returnTo=%2Fdashboard"}
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
        <nav aria-label="Legal and contact">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:hey@itsparam.in">Contact</a>
        </nav>
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
