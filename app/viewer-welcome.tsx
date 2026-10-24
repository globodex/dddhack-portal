import { ArrowRight, ArrowUpRight, Compass, FolderOpen, UsersRound } from "lucide-react";
import { HeadingDot } from "./expressive-heading";

// This is the same approved registration destination used by the public landing.
export const eventRegistrationURL = "https://luma.com/6t5uk4lo";

export default function ViewerWelcome({ removed = false }: { removed?: boolean }) {
  return (
    <section className="viewer-welcome" aria-labelledby="viewer-title">
      <header className="viewer-intro">
        <span className="viewer-mode"><Compass size={16} aria-hidden="true" />Viewer mode</span>
        <HeadingDot color="orange" expression="plus" size={72} paused />
        <h1 id="viewer-title">Take a look around.</h1>
        <p>{removed ? "Your participant access was removed. Contact an organizer to restore it." : "Register on Luma to join the hackathon. Until then, explore the people, teams and projects."}</p>
        <a className="button" href={removed ? "mailto:hey@itsparam.in" : eventRegistrationURL} {...(!removed ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {removed ? "Contact an organizer" : "Register on Luma"}<ArrowUpRight size={20} aria-hidden="true" />
        </a>
      </header>
      <nav className="viewer-destinations" aria-label="Explore the hackathon">
        {[
          { href: "/discover/participants", name: "People", icon: UsersRound },
          { href: "/discover/teams", name: "Teams", icon: Compass },
          { href: "/projects", name: "Projects", icon: FolderOpen },
        ].map(({ href, name, icon: Icon }) => (
          <a key={href} href={href}><Icon size={24} aria-hidden="true" /><span>{name}</span><ArrowRight size={20} aria-hidden="true" /></a>
        ))}
      </nav>
    </section>
  );
}
