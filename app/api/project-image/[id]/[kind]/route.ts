import { proxyBackendRequest } from "../../../../../lib/next-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = proxyBackendRequest;
