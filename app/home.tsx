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
import { confirmedAgenda, viewportChapterGeometry } from "./home-geometry";
type Content = typeof defaultPublicContent;
type PrivateArrival = { location: string; directions: string; mapUrl: string };
function arrivalMapUrl(value: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (["maps.app.goo.gl", "maps.google.com"].includes(url.hostname) ||
        (["google.com", "www.google.com"].includes(url.hostname) &&
          url.pathname.startsWith("/maps")) ||
        (url.hostname === "goo.gl" && url.pathname.startsWith("/maps")))
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
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
  privateVenue,
}: {
  items: Content["agenda"];
  paused: boolean;
  privateVenue?: PrivateArrival;
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
      const header = node
        .closest(".public-home-shell")
        ?.querySelector<HTMLElement>(".navigation-header, .public-header");
      const headerHeight =
        header && getComputedStyle(header).position === "sticky"
          ? header.getBoundingClientRect().height
          : 0;
      const natural = chapters.map((chapter) => {
        const content = chapter.querySelector<HTMLElement>(".chapter-content")!;
        const style = getComputedStyle(chapter);
        return Math.ceil(
          content.getBoundingClientRect().height +
            parseFloat(style.borderTopWidth) +
            parseFloat(style.borderBottomWidth),
        );
      });
      const layout = viewportChapterGeometry(
        innerWidth,
        innerHeight,
        headerHeight,
        natural,
        paused || reduced.matches,
      );
      node.dataset.enhanced = String(layout.enabled);
      node.dataset.mobileStack = String(layout.enabled && innerWidth <= 740);
      node.dataset.desktopStack = String(layout.enabled && innerWidth >= 1000);
      node.style.setProperty("--public-header-height", `${headerHeight}px`);
      chapters.forEach((chapter, index) => {
        chapter.style.setProperty("--chapter-top", `${layout.tops[index]}px`);
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
    const header = node
      .closest(".public-home-shell")
      ?.querySelector(".navigation-header, .public-header");
    if (header) resize.observe(header);
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
            {privateVenue && (
              <div className="home-private-arrival">
                {privateVenue.location && <h4>{privateVenue.location}</h4>}
                {privateVenue.directions && <p>{privateVenue.directions}</p>}
                {arrivalMapUrl(privateVenue.mapUrl) && (
                  <a
                    className="button secondary"
                    href={arrivalMapUrl(privateVenue.mapUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Maps <ArrowUpRight size={18} aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
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
  privateVenue,
}: {
  content?: Content;
  signedIn?: boolean;
  privateVenue?: PrivateArrival;
  submissionClose?: string | null;
}) {
  const [paused, setPaused] = useState(false),
    [ready, setReady] = useState(false),
    [visible, setVisible] = useState(true);
  const hero = useRef<HTMLElement>(null);
  useEffect(() => {
    try {
      setPaused(localStorage.getItem("portal-pause-motion") === "true");
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    const section = hero.current;
    if (!section) return;
    // The sticky header (and any real notice above Home) already occupies the
    // viewport. Measure layout space, not an assumed breakpoint-specific height.
    const measure = () => {
      const top = Math.max(0, section.getBoundingClientRect().top + scrollY);
      section.style.setProperty("--hero-header-height", `${top}px`);
    };
    const resize = new ResizeObserver(measure);
    const shell = section.closest(".public-home-shell");
    const header = shell?.querySelector(".navigation-header, .public-header");
    if (header) resize.observe(header);
    if (section.parentElement?.parentElement)
      resize.observe(section.parentElement.parentElement);
    measure();
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(section);
    return () => {
      resize.disconnect();
      observer.disconnect();
    };
  }, []);
  return (
    <div className="home" data-paused={paused}>
      <section className="home-hero" aria-labelledby="home-title" ref={hero}>
        <div
          className="hero-copy"
          tabIndex={0}
          role="region"
          aria-label="Event information and registration"
        >
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
            <span className="hero-partner hero-brand-lockup">
              <img
                className="hero-openai-wordmark"
                src="/brand/openai-wordmark-official.svg"
                alt="OpenAI"
                width={1212}
                height={542}
                decoding="async"
              />
              <span className="hero-brand-separator" aria-hidden="true">
                ×
              </span>
              <img
                className="hero-cerebras-wordmark"
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
        <div className="hero-art hero-rail" aria-hidden="true">
          <Dots paused={paused || !ready} rail />
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
      <Chapters
        items={content.agenda}
        paused={paused}
        privateVenue={privateVenue}
      />
      <OrganizerSection paused={paused} />
      <footer className="home-footer">
        <p className="home-community-tags">
          <span>#DevDayCommunity</span>
          <span>#DevDayCommunityDelhi</span>
        </p>
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
