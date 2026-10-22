import { handleExport } from "../../../lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (import.meta.env.DEV && process.env.PORTAL_LOCAL_TEST === "1") {
    const { localRuntime } = await import("../../../lib/local-test/runtime");
    return handleExport(request, await localRuntime(request));
  }
  return new Response("Hosted adapter unavailable", {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}
