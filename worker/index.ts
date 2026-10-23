import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

import {
  runWithSitesRequest,
  dispatchConfigured,
  protectedPath,
  unavailableResponse,
  getSitesRuntime,
} from "../lib/sites-runtime";
import { PortalService } from "../lib/service";
import { signInPath } from "../lib/identity";
import { PortalError } from "../lib/security";

const worker = {
  fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    // Sites Dispatch is the sole trusted ingress. On ordinary local/standalone
    // Workers these flags remain unset; never accept caller-supplied identity.
    if (!dispatchConfigured(env)) {
      const headers = new Headers(request.headers);
      for (const name of headers.keys()) {
        if (name.startsWith("oai-authenticated-user-")) headers.delete(name);
      }
      request = new Request(request, { headers });
      if (protectedPath(new URL(request.url).pathname)) {
        return unavailableResponse(
          new PortalError(503, "SITES_DISPATCH_NOT_CONFIGURED"),
        );
      }
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt)
            return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return {
              status: "request_context_expired",
              message: "This request has expired. Please try again.",
            };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithSitesRequest(request, env, async () => {
      const url = new URL(request.url);
      if (!import.meta.env.DEV && url.pathname === "/local-test") {
        return new Response("Not found", { status: 404 });
      }
      if (protectedPath(url.pathname)) {
        try {
          const runtime = getSitesRuntime();
          if (!runtime.identity) {
            return new Response(null, {
              status: 302,
              headers: {
                Location: new URL(signInPath(url.pathname + url.search), url)
                  .href,
                "Cache-Control": "private, no-store",
              },
            });
          }
          // Authorize before rendering; framework error pages must not turn
          // permission denials into successful participant/admin shells.
          const service = new PortalService(
            runtime.db,
            runtime.identity,
            runtime.key,
          );
          await service.view(url.pathname);
        } catch (error) {
          // The page deliberately renders the account-switch recovery shell for
          // a verified email outside the roster. API access still fails closed.
          if (!(
            error instanceof PortalError && error.code === "LUMA_EMAIL_MISMATCH"
          ))
            return unavailableResponse(error);
        }
      }
      const response = await runWithConnectorBinding(binding, () =>
        handler.fetch(request, env, ctx),
      );
      if (protectedPath(url.pathname)) {
        const privateResponse = new Response(response.body, response);
        privateResponse.headers.set("Cache-Control", "private, no-store");
        privateResponse.headers.append(
          "Vary",
          "Cookie, oai-authenticated-user-id",
        );
        return privateResponse;
      }
      return response;
    });
  },
};

export default worker;
