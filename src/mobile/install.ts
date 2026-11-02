import { routeMobileApi } from "./handlers/router";
import type { MobileRequest } from "./request";
import { startMobileScheduler } from "./scheduler";

export const isMobileBuild = process.env.NEXT_PUBLIC_TARGET === "mobile";

let installed = false;

function requestUrl(input: RequestInfo | URL): URL {
  const value = input instanceof Request ? input.url : input instanceof URL ? input.toString() : input;
  return new URL(value, window.location.href);
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (init?.headers !== undefined) return new Headers(init.headers);
  return input instanceof Request ? new Headers(input.headers) : new Headers();
}

function requestBody(input: RequestInfo | URL, init?: RequestInit): () => Promise<unknown> {
  if (init?.body !== undefined) {
    return () => new Response(init.body).json();
  }
  if (input instanceof Request) return () => input.clone().json();
  return () => Promise.reject(new SyntaxError("Request body is empty"));
}

function mobileRequest(input: RequestInfo | URL, init?: RequestInit): MobileRequest {
  return {
    url: requestUrl(input),
    method: (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
    headers: requestHeaders(input, init),
    signal: init?.signal ?? (input instanceof Request ? input.signal : null),
    json: requestBody(input, init),
  };
}

export function installMobileApi(): void {
  if (!isMobileBuild || typeof window === "undefined" || installed) return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = mobileRequest(input, init);
    if (request.url.origin === window.location.origin && request.url.pathname.startsWith("/api/")) {
      return routeMobileApi(request);
    }
    return nativeFetch(input, init);
  };

  void startMobileScheduler();
}
