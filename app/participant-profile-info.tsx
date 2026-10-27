"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Info,
  BriefcaseBusiness,
  Building2,
  Phone,
  Mail,
  ExternalLink,
} from "lucide-react";
import DiscoveryProfile, {
  discoveryProfileProjection,
  discoverySocialLinks,
  discoveryDetailsProjection,
  type DiscoveryPerson,
} from "./discovery-profile";
import { GenderSymbol, genderLabel } from "./gender-presentation";
import DotAvatar from "./dot-avatar";
import { useHydrated } from "./use-hydrated";

export class ProfileLookupError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable = ![401, 403, 404].includes(status),
  ) {
    super(message);
  }
}

/** One selected lookup per click, no cache; changing account/target cancels stale data. */
export class SelectedProfileRequest {
  private controller: AbortController | null = null;
  constructor(private readonly timeoutMs = 15_000) {}
  cancel() {
    this.controller?.abort();
    this.controller = null;
  }
  async read(id: string): Promise<DiscoveryPerson> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    let timedOut = false;
    const canceled = () =>
      new DOMException("Profile request canceled", "AbortError");
    let rejectAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () =>
        reject(
          timedOut
            ? new ProfileLookupError(
                "Profile loading timed out. Try again.",
                408,
              )
            : canceled(),
        );
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const params = new URLSearchParams({
      view: "/discover/participants",
      person: id,
      limit: "1",
    });
    const read = async () => {
      const response = await fetch(`/api/portal?${params}`, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (controller.signal.aborted) throw canceled();
      // An expired session may be an HTML response from a proxy. Its status
      // remains actionable even when it has no JSON error body.
      if (response.status === 401) {
        void response.body?.cancel().catch(() => {});
        throw new ProfileLookupError("Sign in to view this profile.", 401);
      }
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        if (controller.signal.aborted) throw canceled();
        throw new ProfileLookupError(
          "Profile could not be loaded. Try again.",
          response.status,
          true,
        );
      }
      if (controller.signal.aborted) throw canceled();
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new ProfileLookupError(
          "Profile could not be loaded. Try again.",
          response.status,
          true,
        );
      const body = raw as {
        message?: string;
        focusedPerson?: Record<string, any>;
      };
      if (!response.ok)
        throw new ProfileLookupError(
          typeof body.message === "string" && body.message.trim()
            ? body.message
            : "Profile could not be loaded. Try again.",
          response.status,
        );
      if (body.focusedPerson?.id !== id)
        throw new ProfileLookupError("This profile is unavailable.", 404);
      return discoveryProfileProjection(body.focusedPerson);
    };
    try {
      // Bound headers and body loading even if a test/transport ignores abort.
      return await Promise.race([read(), aborted]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", rejectAbort);
      if (this.controller === controller) this.controller = null;
    }
  }
}

type ProfileTarget = { id: string; name: string };
const Context = createContext<{
  actorId: string;
  returnTo: string;
  open: (target: ProfileTarget, opener: HTMLElement) => void;
} | null>(null);

export function ParticipantProfiles({
  actorKey,
  actorId,
  returnTo,
  accessVersion,
  staff = false,
  children,
}: {
  actorKey: string;
  actorId: string;
  returnTo: string;
  accessVersion?: unknown;
  staff?: boolean;
  children: ReactNode;
}) {
  const lookup = useRef<SelectedProfileRequest | null>(null);
  if (!lookup.current) lookup.current = new SelectedProfileRequest();
  const currentKey = useRef({ actorKey, accessVersion });
  currentKey.current = { actorKey, accessVersion };
  const opener = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<{
    key: string;
    target: ProfileTarget;
    person?: DiscoveryPerson;
    pending: boolean;
    error?: string;
    status?: number;
    retryable?: boolean;
  } | null>(null);
  useEffect(() => {
    lookup.current?.cancel();
    setState(null);
    return () => lookup.current?.cancel();
  }, [actorKey, returnTo, accessVersion]);
  const close = () => {
    lookup.current?.cancel();
    setState(null);
  };
  const read = async (target: ProfileTarget) => {
    const key = actorKey;
    const snapshot = accessVersion;
    setState({ key, target, pending: true });
    try {
      const person = await lookup.current!.read(target.id);
      if (
        currentKey.current.actorKey === key &&
        currentKey.current.accessVersion === snapshot
      )
        setState({ key, target, person, pending: false });
    } catch (error) {
      if (
        (error as Error).name !== "AbortError" &&
        currentKey.current.actorKey === key &&
        currentKey.current.accessVersion === snapshot
      )
        setState({
          key,
          target,
          pending: false,
          error:
            error instanceof TypeError
              ? "Profile could not be loaded. Check your connection and try again."
              : (error as Error).message,
          status:
            error instanceof ProfileLookupError ? error.status : undefined,
          retryable:
            error instanceof ProfileLookupError ? error.retryable : true,
        });
    }
  };
  const signIn = "/signin?returnTo=" + encodeURIComponent(returnTo);
  return (
    <Context.Provider
      value={{
        actorId,
        returnTo,
        open: (target, button) => {
          opener.current = button;
          void read(target);
        },
      }}
    >
      {children}
      {state && state.key === actorKey && (
        <DiscoveryProfile
          stableFrame
          person={
            state.person || {
              name: state.target.name,
              bio: "",
              socials: [],
              avatarColor: "grey",
              avatarExpression: "neutral",
            }
          }
          pending={state.pending}
          emailUnavailable={staff && !!state.person && !state.person.details?.email}
          error={state.error}
          signInUrl={state.status === 401 ? signIn : undefined}
          onRetry={
            state.retryable === false
              ? undefined
              : () => void read(state.target)
          }
          onClose={() => {
            close();
            if (opener.current?.isConnected)
              opener.current.focus({ preventScroll: true });
          }}
        />
      )}
    </Context.Provider>
  );
}

export function ProfileInfoButton({
  personId,
  name,
}: {
  personId?: string | null;
  name: string;
}) {
  const context = useContext(Context);
  const hydrated = useHydrated();
  if (!personId || !context) return null;
  const label = `View ${name}'s profile`;
  const icon = <Info size={18} aria-hidden="true" />;
  if (!context.actorId)
    return (
      <a
        className="participant-profile-info"
        href={"/signin?returnTo=" + encodeURIComponent(context.returnTo)}
        aria-label={`Sign in to view ${name}'s profile`}
        title="Sign in to view profile"
      >
        {icon}
      </a>
    );
  return (
    <button
      type="button"
      className="participant-profile-info"
      aria-label={label}
      title={label}
      disabled={!hydrated}
      onClick={(event) =>
        context.open({ id: personId, name }, event.currentTarget)
      }
    >
      {icon}
    </button>
  );
}

export function ProjectTeamMembers({
  members,
  admin = false,
}: {
  members?: Record<string, any>[];
  admin?: boolean;
}) {
  if (!Array.isArray(members) || !members.length) return null;
  return (
    <section className="project-team-members" aria-label="Team members">
      <h2>Team members</h2>
      <ul>
        {members.map((member) => {
          const details = discoveryDetailsProjection(member.details);
          const links = discoverySocialLinks(
            Array.isArray(member.socials) ? member.socials : [],
          );
          return (
            <li key={member.id}>
              <DotAvatar
                color={member.avatarColor || "blue"}
                expression={member.avatarExpression || "squeezed"}
                size={40}
                decorative
              />
              <div className="project-team-member-body">
                <div className="project-team-member-heading">
                  <strong className="project-team-member-name">
                    {member.name}
                  </strong>
                  {admin && typeof member.status === "string" && (
                    <span className="project-team-member-status">
                      {member.status}
                    </span>
                  )}
                </div>
                <div className="project-team-member-chips">
                  {details?.profession && (
                    <span>
                      <BriefcaseBusiness size={15} aria-hidden="true" />
                      {details.profession}
                    </span>
                  )}
                  {details?.gender && (
                    <span>
                      <GenderSymbol value={details.gender} size={15} />
                      {genderLabel(details.gender)}
                    </span>
                  )}
                  {details?.organization && (
                    <span>
                      <Building2 size={15} aria-hidden="true" />
                      {details.organization}
                    </span>
                  )}
                </div>
                {member.bio && (
                  <p className="project-team-member-bio">{member.bio}</p>
                )}
                {(links.length > 0 ||
                  (admin &&
                    (member.email ||
                      details?.phone ||
                      details?.openaiOrgId))) && (
                  <div className="project-team-member-links">
                    {links.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${member.name}: ${link.label} (opens in a new tab)`}
                        title={link.label}
                      >
                        <img
                          src={`/icons/social/${link.icon}.svg`}
                          width={20}
                          height={20}
                          alt=""
                        />
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ))}
                    {admin && typeof member.email === "string" && (
                      <span>
                        <Mail size={15} aria-hidden="true" />
                        {member.email}
                      </span>
                    )}
                    {admin && details?.phone && (
                      <span>
                        <Phone size={15} aria-hidden="true" />
                        {details.phone}
                      </span>
                    )}
                    {admin && details?.openaiOrgId && (
                      <span>{details.openaiOrgId}</span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
