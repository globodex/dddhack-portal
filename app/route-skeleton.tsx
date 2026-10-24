import type { CSSProperties } from "react";

type SkeletonLayout = "dashboard" | "profile" | "people" | "teams" | "credits" | "rules" | "list" | "table" | "detail" | "form";

export function routeSkeletonLayout(path: string): SkeletonLayout {
  if (path === "/profile" || path === "/dashboard/profile") return "profile";
  if (path === "/dashboard") return "dashboard";
  if (path === "/discover/participants") return "people";
  if (path === "/discover/teams" || path === "/admin/teams") return "teams";
  if (path === "/admin/credits") return "credits";
  if (path === "/rules") return "rules";
  if (/^\/(projects|review|admin\/submissions)\/[^/]+/.test(path)) return "detail";
  if (path === "/admin/settings" || path === "/submission") return "form";
  if (path.startsWith("/admin") || path === "/review") return "table";
  return "list";
}

function Block({ width = "100%", shape = "line" }: { width?: string; shape?: string }) {
  return <span className={`route-skeleton-block route-skeleton-${shape}`} style={{ "--skeleton-width": width } as CSSProperties} />;
}

function Rows({ count = 4, table = false }: { count?: number; table?: boolean }) {
  return <div className={table ? "route-skeleton-table" : "route-skeleton-list"}>
    {Array.from({ length: count }, (_, index) => <div className="route-skeleton-row" key={index}>
      <Block shape="avatar" />
      <div className="route-skeleton-copy"><Block width="42%" /><Block width="68%" /></div>
      {table && <><Block width="72%" /><Block width="56%" /></>}
      <Block shape="action" />
    </div>)}
  </div>;
}

function Fields() {
  return <div className="route-skeleton-fields">
    {[0, 1, 2].map((index) => <div className="route-skeleton-field" key={index}><Block width="28%" /><Block shape="input" /></div>)}
  </div>;
}

// Shapes reserve the current route's space; they never stand in for record data.
export default function RouteSkeleton({ path }: { path: string }) {
  const layout = routeSkeletonLayout(path);
  return <section className="route-skeleton" data-layout={layout} aria-busy="true" aria-label="Page loading">
    <p className="sr-only" role="status" aria-live="polite">Loading…</p>
    <div className="route-skeleton-shapes" aria-hidden="true">
      <div className="route-skeleton-heading"><Block shape="avatar" /><Block width="11rem" shape="title" /></div>
      {layout === "profile" ? <div className="route-skeleton-profile">
        <Fields />
        <div className="route-skeleton-palette">{Array.from({ length: 8 }, (_, index) => <Block key={index} shape="avatar" />)}</div>
        <Block shape="action" />
      </div> : layout === "dashboard" ? <>
        <div className="route-skeleton-tabs"><Block width="6rem" /><Block width="6rem" /><Block width="6rem" /></div>
        <div className="route-skeleton-panel route-skeleton-team-identity"><Block shape="avatar" /><Block width="34%" shape="title" /><Block shape="action" /></div>
        <div className="route-skeleton-workspace"><div className="route-skeleton-panel"><Block width="42%" /><Rows count={3} /></div><div className="route-skeleton-panel"><Block width="32%" /><Fields /><Block shape="action" /></div></div>
      </> : layout === "people" ? <>
        <div className="route-skeleton-tabs"><Block width="6rem" /><Block width="6rem" /></div>
        <div className="route-skeleton-toolbar"><Block shape="input" width="40%" /><Block shape="action" /></div>
        <div className="route-skeleton-cards">{[0, 1, 2, 3, 4, 5].map((index) => <div className="route-skeleton-panel" key={index}><Block shape="avatar" /><Block width="64%" /><Block width="82%" /><Block shape="action" /></div>)}</div>
      </> : layout === "teams" ? <><div className="route-skeleton-toolbar"><Block shape="input" width="40%" /><Block shape="action" /></div><div className="route-skeleton-team-cards">{[0,1,2,3].map(index => <div key={index} className="route-skeleton-panel"><div className="route-skeleton-heading"><Block shape="avatar" /><Block width="52%" /></div><Block width="82%" /><Block width="62%" /><Block shape="action" /></div>)}</div></>
        : layout === "credits" ? <><div className="route-skeleton-panel"><Block width="30%" shape="title" /><Block shape="input" /><Block shape="action" /></div><div className="route-skeleton-team-cards">{[0,1].map(index => <div className="route-skeleton-panel" key={index}><Block width="50%" /><Fields /></div>)}</div></>
        : layout === "rules" ? <div className="route-skeleton-team-cards">{[0,1,2,3].map(index => <div className="route-skeleton-panel" key={index}><Block width="60%" shape="title" /><Block /><Block width="82%" /><Block width="92%" /></div>)}</div>
        : layout === "form" ? <><div className="route-skeleton-tabs"><Block width="6rem" /><Block width="6rem" /><Block width="6rem" /><Block width="6rem" /></div><div className="route-skeleton-panel"><Fields /><Block shape="action" /></div></>
        : layout === "detail" ? <div className="route-skeleton-panel"><Block shape="banner" /><Block width="68%" shape="title" /><Block /><Block width="82%" /><Block width="60%" /></div>
          : <><div className="route-skeleton-toolbar"><Block shape="input" width="40%" /><Block shape="action" /></div><Rows table={layout === "table"} /></>}
    </div>
  </section>;
}
