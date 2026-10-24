import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { HeadingDot } from "./expressive-heading";
import InformationNavigation from "./information-navigation";

export const privacyContact = "hey@itsparam.in";
export const portalOperator = "Parampreet Singh";
type InformationSection = { id: string; title: string; content: ReactNode };

const privacySections: InformationSection[] = [
  {
    id: "operator",
    title: "Who operates this portal",
    content: (
      <p>
        {portalOperator} operates this portal for the DevDay Exchange community
        hackathon in New Delhi, hosted by Codex Ambassadors. For privacy
        questions or a deletion request, contact{" "}
        <a href={`mailto:${privacyContact}`}>{privacyContact}</a>.
      </p>
    ),
  },
  {
    id: "information",
    title: "Information we handle",
    content: (
      <ul>
        <li>
          <strong>Account and registration:</strong> your name, email, verified
          sign-in identity and registration details imported by the organizer.
          Profile fields include bio, phone, sex, occupation or student
          category, organization, optional OpenAI organization ID, optional
          social links and your chosen dot avatar.
        </li>
        <li>
          <strong>Event participation:</strong> registration and check-in
          status, team membership, invitations, private team ideas, project
          submissions, submitted versions, review records, votes and comments.
        </li>
        <li>
          <strong>Personal credits:</strong> provider assignments and redemption
          values where credits have been assigned to you. Credit values are
          access-controlled and excluded from ordinary audit logs and
          participant exports.
        </li>
        <li>
          <strong>Security and administration:</strong> session and
          browser-verification records, sign-in limits, administrative actions,
          account identifiers and timestamps.
        </li>
      </ul>
    ),
  },
  {
    id: "visibility",
    title: "How information is used and shared",
    content: (
      <>
        <p>
          The portal uses this information to verify access, support
          registration and check-in, connect teammates, manage submissions,
          provide assigned credits and run event administration and review.
        </p>
        <p>
          Your name, avatar and team membership can appear in signed-in
          discovery. Bio and social links follow profile visibility. Phone
          numbers and WhatsApp links are limited to current teammates and
          authorized administrators; they are excluded from public and Viewer
          profile payloads. Staff access follows the portal's server
          permissions.
        </p>
        <p>
          Eligible published project pages and their public comments can be
          viewed without signing in. Private team ideas, unpublished project
          drafts, personal credit values and private judging feedback are
          separate from that public showcase.
        </p>
      </>
    ),
  },
  {
    id: "services",
    title: "Services and external links",
    content: (
      <>
        <dl className="information-services">
          <div>
            <dt>Vercel and Neon</dt>
            <dd>
              The selected deployment uses Vercel for the frontend and Neon for
              the backend, database and project media storage.
            </dd>
          </div>
          <div>
            <dt>Google and Gmail</dt>
            <dd>
              Google provides the optional Google sign-in flow. The configured
              Gmail SMTP service delivers email sign-in links.
            </dd>
          </div>
          <div>
            <dt>Luma</dt>
            <dd>
              Event registration takes place on Luma. The organizer can import
              registration information into this portal.
            </dd>
          </div>
          <div>
            <dt>GitHub and OpenAI</dt>
            <dd>
              Project review can use repository evidence and, when configured
              and run by an authorized organizer, send selected project
              descriptions, approved text files and commit metadata to OpenAI.
              The integration is designed to exclude participant profile fields,
              phone records, credit values and credentials from its request
              projection. Provider processing terms still apply.
            </dd>
          </div>
          <div>
            <dt>Cloudflare</dt>
            <dd>
              Cloudflare provides DNS and proxy/network delivery for the custom
              hostname, processing requests that pass through its network. Exact
              logging, analytics settings and retention still need organizer
              confirmation.
            </dd>
          </div>
        </dl>
        <p>
          Opening a social, WhatsApp, map, registration, repository or provider
          link takes you to that external service, which applies its own privacy
          terms.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and technical data",
    content: (
      <>
        <p>
          Essential cookies support sign-in, browser verification and portal
          sessions. The current session cookie lasts up to seven days;
          email-link browser verification lasts 15 minutes and Google sign-in
          verification lasts 10 minutes. On HTTPS these cookies are host-only,
          HttpOnly and Secure, with SameSite=Lax. The motion pause preference is
          stored locally in your browser.
        </p>
        <p>
          The reviewed application source has no added advertising or analytics
          SDK. That does not establish the absence of hosting, DNS or
          network-provider logs or deployment-level analytics. Those settings
          and their retention still need organizer confirmation before this
          draft is finalized.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Retention",
    content: (
      <>
        <p>
          <strong>Unnecessary private participant data:</strong> the organizer's
          confirmed policy is a 90-day retention period after the event. The
          organizer handles retention and removal requests through authorized
          manual review. There is no automatic purge. Hiding a record from
          portal views does not itself erase its stored data.
        </p>
        <p>
          <strong>Public project showcase:</strong> published showcase content
          is retained unless removal is requested. A request can be sent to the
          privacy contact above.
        </p>
        <p>
          <strong>Owner-only audit logs:</strong> administrative audit records
          are retained indefinitely and are separate from the 90-day
          private-participant-data policy.
        </p>
        <p>
          Any exceptional records that must be retained, backup handling and
          provider-side log retention remain to be confirmed. Expiry of a
          sign-in cookie is not a promise that every related stored record has
          been deleted.
        </p>
      </>
    ),
  },
  {
    id: "requests",
    title: "Your requests",
    content: (
      <>
        <p>
          Email <a href={`mailto:${privacyContact}`}>{privacyContact}</a> to
          request access, correction, removal or clarification. Using your
          registered email and identifying the profile or project helps the
          organizer locate the relevant record and verify the request.
        </p>
        <p>
          Do not send passwords, API keys or credit redemption values. This is a
          manual contact process; the portal does not currently provide a
          self-service deletion workflow or a guaranteed response deadline.
        </p>
      </>
    ),
  },
  {
    id: "review",
    title: "Before this draft is finalized",
    content: (
      <p>
        The organizer still needs to confirm exceptional retention categories,
        backups, provider logs and deployment analytics settings, processing
        locations and the policy for school-age participants. Existing stored
        event notices must be reviewed and aligned with the retention categories
        above. This draft makes no blanket legal-compliance guarantee.
      </p>
    ),
  },
];

const termsSections: InformationSection[] = [
  {
    id: "community",
    title: "Using this community portal",
    content: (
      <p>
        This portal is operated by {portalOperator} for the DevDay Exchange
        community hackathon in New Delhi, hosted by Codex Ambassadors. The
        approved public event date is 1 November 2026, 8 AM to 8 PM IST, with
        the general venue at IIIT Delhi. Exact arrival details are shared
        through authorized event channels.
      </p>
    ),
  },
  {
    id: "participation",
    title: "Registration, teams and submissions",
    content: (
      <>
        <p>
          Use your own verified registration email and accurate profile details.
          Luma registration alone does not guarantee on-site admission;
          organizer approval and check-in apply.
        </p>
        <p>
          Teams have up to five members. Saving and locking a team idea freezes
          the relevant team details and membership; it does not itself approve
          attendance. The team leader commits project submissions, with up to
          three committed submissions under the event's current rules. Follow
          the submission window and rules shown in the portal.
        </p>
      </>
    ),
  },
  {
    id: "content",
    title: "Your project content",
    content: (
      <>
        <p>
          Submit material you have permission to share and preserve the
          attribution and licenses of any third-party work. Do not put
          credentials, private keys, personal credit values or another person's
          private information in project descriptions, media or submitted source
          files.
        </p>
        <p>
          The portal can display eligible published project content in its
          public showcase. Private team ideas, unpublished drafts and private
          feedback remain subject to their separate access controls.
          Organizer-authorized project review can use the selected evidence
          described in the <a href="/privacy">privacy draft</a>.
        </p>
        <p>
          OpenAI, Codex and other product names and logos remain the property of
          their respective owners. Their use here identifies the community
          context or referenced tools; this draft does not transfer trademark or
          copyright ownership.
        </p>
      </>
    ),
  },
  {
    id: "community-actions",
    title: "Community participation and credits",
    content: (
      <>
        <p>
          Use one vote per person per project and keep comments relevant and
          respectful. Do not impersonate other participants or try to access
          private team, credit or administration data.
        </p>
        <p>
          Credit access depends on actual assignment and the required check-in
          status. Provider redemption conditions apply. This draft promises no
          particular credit amount, prize, ranking or review outcome.
        </p>
        <p>
          Authorized organizers can correct event records and manage
          participation or project visibility using the portal's existing
          permissions. Direct questions about a record or decision to{" "}
          <a href={`mailto:${privacyContact}`}>{privacyContact}</a>.
        </p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy and removal requests",
    content: (
      <p>
        The <a href="/privacy">privacy draft</a> describes the confirmed 90-day
        policy for unnecessary private participant data, the public showcase and
        separate indefinite owner-only audit logs. Requests are handled manually
        through <a href={`mailto:${privacyContact}`}>{privacyContact}</a>; no
        automatic purge is claimed.
      </p>
    ),
  },
  {
    id: "review",
    title: "Before these terms are finalized",
    content: (
      <p>
        Age and guardian-consent rules, any applicable cancellation or refund
        arrangements, legal jurisdiction, dispute handling and exceptional
        record-retention obligations still require organizer review. These are
        draft terms for review, not a statement that every legal requirement has
        been resolved.
      </p>
    ),
  },
];

export const informationPages = {
  privacy: {
    title: "Privacy notice",
    color: "purple" as const,
    sections: privacySections,
  },
  terms: {
    title: "Terms of participation",
    color: "green" as const,
    sections: termsSections,
  },
};

export default function PublicInformation({
  kind,
}: {
  kind: keyof typeof informationPages;
}) {
  const page = informationPages[kind];
  return (
    <div className="information-page">
      <a className="information-skip" href="#information-main">
        Skip to content
      </a>
      <header className="information-header">
        <a className="information-brand" href="/">
          <img
            src="/brand/codex-user-supplied.svg"
            width={28}
            height={28}
            alt=""
          />
          <span>Codex Community New Delhi</span>
        </a>
        <InformationNavigation path={`/${kind}`} />
      </header>
      <main id="information-main" className="information-layout">
        <header className="information-title">
          <span className="information-draft">Draft for organizer review</span>
          <h1>
            <HeadingDot color={page.color} expression="plus" size={42} />
            {page.title}
          </h1>
          <p>Prepared 24 October 2026. This draft has not been finalized.</p>
        </header>
        <nav className="information-contents" aria-label="On this page">
          <span>Contents</span>
          <ol>
            {page.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="information-body" aria-label={page.title}>
          {page.sections.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </article>
      </main>
      <footer className="information-footer">
        <a
          href="/privacy"
          aria-current={kind === "privacy" ? "page" : undefined}
        >
          Privacy
        </a>
        <a href="/terms" aria-current={kind === "terms" ? "page" : undefined}>
          Terms
        </a>
        <a href={`mailto:${privacyContact}`}>
          Contact <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
