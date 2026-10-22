import { handlePortal } from "../../../lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return route(request);
}
export async function POST(request: Request) {
  return route(request);
}
async function route(request: Request) {
  if (import.meta.env.DEV && process.env.PORTAL_LOCAL_TEST === "1") {
    const { localRuntime } = await import("../../../lib/local-test/runtime");
    return handlePortal(request, await localRuntime(request));
  }
  return Response.json(
    {
      code: "HOSTED_ADAPTER_UNAVAILABLE",
      message:
        "Hosted authentication and D1 wiring require the supported Sites starter. Local rehearsal is available only in development.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
