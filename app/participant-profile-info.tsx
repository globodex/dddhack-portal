"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Info } from "lucide-react";
import DiscoveryProfile, {
  discoveryProfileProjection,
  type DiscoveryPerson,
} from "./discovery-profile";
import DotAvatar from "./dot-avatar";
import { useHydrated } from "./use-hydrated";

export class ProfileLookupError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** One selected lookup per click, no cache; changing account/target cancels stale data. */
export class SelectedProfileRequest {
  private controller: AbortController | null = null;
  cancel() {
    this.controller?.abort();
    this.controller = null;
  }
  async read(id: string): Promise<DiscoveryPerson> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const params = new URLSearchParams({
      view: "/discover/participants",
      person: id,
      limit: "1",
    });
    try {
      const response = await fetch(`/api/portal?${params}`, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json()) as {
        message?: string;
        focusedPerson?: Record<string, any>;
      };
      if (controller.signal.aborted)
        throw new DOMException("Profile request canceled", "AbortError");
      if (!response.ok)
        throw new ProfileLookupError(
          response.status === 401
            ? "Sign in to view this profile."
            : body.message || "Profile could not be loaded.",
          response.status,
        );
      if (body.focusedPerson?.id !== id)
        throw new ProfileLookupError("This profile is unavailable.", 404);
      return discoveryProfileProjection(body.focusedPerson);
    } finally {
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
  children,
}: {
  actorKey: string;
  actorId: string;
  returnTo: string;
  accessVersion?: unknown;
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
          error={state.error}
          signInUrl={state.status === 401 ? signIn : undefined}
          onRetry={
            state.status === 404 || state.status === 403
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
        {members.map((member) => (
          <li key={member.id}>
            <DotAvatar
              color={member.avatarColor || "blue"}
              expression={member.avatarExpression || "squeezed"}
              size={36}
              decorative
            />
            <span className="project-team-member-name">{member.name}</span>
            {admin && typeof member.status === "string" && (
              <span className="project-team-member-status">
                {member.status}
              </span>
            )}
            <ProfileInfoButton personId={member.id} name={member.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}
