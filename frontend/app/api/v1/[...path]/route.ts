import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for the HeatFair FastAPI service.
 *
 * The browser always calls `/api/v1/*` on this site, so session cookies stay
 * first-party and no CORS/mixed-content negotiation is needed. The API host is
 * a server-side setting, not a build-time constant:
 *
 *   HEATFAIR_API_URL=https://heatfair-api.example.com
 *
 * NEXT_PUBLIC_API_URL is only read as a fallback for existing deployments.
 */
const API_TARGET = (
  process.env.HEATFAIR_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

const REQUEST_HEADERS = ["content-type", "accept", "accept-language", "authorization", "cookie"];
const RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control", "location"];

type RouteContext = { params: Promise<{ path?: string[] }> };

async function forward(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;

  if (!API_TARGET) {
    return Response.json(
      {
        detail:
          "HeatFair API is not configured for this deployment. Set HEATFAIR_API_URL to the FastAPI service URL and redeploy.",
      },
      { status: 502 },
    );
  }

  const target = new URL(`${API_TARGET}/api/v1/${path.join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = request.method.toUpperCase();
  const sendsBody = !["GET", "HEAD"].includes(method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: sendsBody ? await request.arrayBuffer() : undefined,
      // OAuth start/callback responses are redirects the browser must follow.
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      {
        detail: `HeatFair API is unreachable at ${API_TARGET}. Check that the service is running and that HEATFAIR_API_URL points at it.`,
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  // Several Set-Cookie headers must survive intact for the session to work.
  const cookies =
    typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const cookie of cookies) responseHeaders.append("set-cookie", cookie);

  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const HEAD = forward;
export const OPTIONS = forward;
