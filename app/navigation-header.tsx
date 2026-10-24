"use client";

import type { ReactNode } from "react";
import { LogIn, Menu } from "lucide-react";
import DotAvatar from "./dot-avatar";

export type NavigationAccount = {
  avatarColor?: string;
  avatarExpression?: string;
  hasProfileAvatar?: boolean;
};

export function navigationAvatarState(account?: NavigationAccount) {
  if (!account) return "anonymous";
  return account.hasProfileAvatar !== false &&
    account.avatarColor &&
    account.avatarExpression
    ? "saved"
    : "placeholder";
}

type ControlsProps = {
  open: boolean;
  hydrated: boolean;
  onOpen: () => void;
  account?: NavigationAccount;
  accountHref?: string;
  accountLabel?: string;
};

export function NavigationControls({
  open,
  hydrated,
  onOpen,
  account,
  accountHref = "/signin?returnTo=%2Fdashboard",
  accountLabel = "Sign in",
}: ControlsProps) {
  const avatarState = navigationAvatarState(account);
  return (
    <div className="navigation-controls">
      <button
        type="button"
        className="navigation-toggle"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-haspopup="dialog"
        disabled={!hydrated}
        onClick={(event) => {
          event.currentTarget.focus();
          onOpen();
        }}
      >
        <Menu size={22} aria-hidden="true" />
      </button>
      <a
        className="navigation-account"
        data-avatar-state={avatarState}
        href={accountHref}
        aria-label={accountLabel}
        title={accountLabel}
      >
        {avatarState === "saved" ? (
          <DotAvatar
            color={account!.avatarColor}
            expression={account!.avatarExpression}
            size={40}
            decorative
          />
        ) : avatarState === "placeholder" ? (
          <span className="navigation-avatar-placeholder" aria-hidden="true" />
        ) : (
          <LogIn size={20} aria-hidden="true" />
        )}
      </a>
    </div>
  );
}

export default function NavigationHeader({
  children,
  ...controls
}: Partial<ControlsProps> & { children?: ReactNode }) {
  return (
    <header className="navigation-header">
      <a
        className="navigation-brand"
        href="/"
        aria-label="DevDay Exchange home"
      >
        <img
          src="/brand/codex-user-supplied.svg"
          width={28}
          height={28}
          alt=""
        />
        <span>Codex Community New Delhi</span>
      </a>
      {children || (
        <NavigationControls
          open={false}
          hydrated={false}
          onOpen={() => {}}
          {...controls}
        />
      )}
    </header>
  );
}
