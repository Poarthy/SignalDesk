export interface MobileRequest {
  url: URL;
  method: string;
  headers: Headers;
  signal?: AbortSignal | null;
  json: () => Promise<unknown>;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function methodNotAllowed(method: string): Response {
  return jsonResponse({ error: `Method ${method} not allowed` }, { status: 405, headers: { allow: "GET, POST, PATCH" } });
}
