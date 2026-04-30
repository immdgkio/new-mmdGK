export const config = {
  runtime: "edge",
};

const BASE_URL = (process.env.TARGET_DOMAIN || "").replace(//$/, "");

const EXCLUDED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

async function proxyRequest(request) {
  if (!BASE_URL) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const requestUrl = new URL(request.url);
    const targetRequestUrl = BASE_URL + requestUrl.pathname + requestUrl.search;

    const requestHeaders = new Headers();
    let clientIpAddress = null;

    for (const [headerKey, headerValue] of request.headers) {
      const lowerCaseKey = headerKey.toLowerCase();
      if (EXCLUDED_HEADERS.has(lowerCaseKey)) continue;
      if (lowerCaseKey.startsWith("x-vercel-")) continue;
      if (lowerCaseKey === "x-real-ip") { clientIpAddress = headerValue; continue; }
      if (lowerCaseKey === "x-forwarded-for") { if (!clientIpAddress) clientIpAddress = headerValue; continue; }
      requestHeaders.set(lowerCaseKey, headerValue);
    }

    if (clientIpAddress) requestHeaders.set("x-forwarded-for", clientIpAddress);

    const httpMethod = request.method;
    const hasRequestBody = httpMethod !== "GET" && httpMethod !== "HEAD";

    const fetchOptions = {
      method: httpMethod,
      headers: requestHeaders,
      redirect: "manual",
    };

    if (hasRequestBody) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    const upstreamResponse = await fetch(targetRequestUrl, fetchOptions);

    const responseHeaders = new Headers();
    for (const [headerKey, headerValue] of upstreamResponse.headers) {
      if (headerKey.toLowerCase() === "transfer-encoding") continue;
      responseHeaders.set(headerKey, headerValue);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}

export default proxyRequest;