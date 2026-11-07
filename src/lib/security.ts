export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireSameOrigin(
  req: Request,
  configuredOrigin: string | undefined,
) {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (
    !configuredOrigin ||
    !origin ||
    site === "cross-site" ||
    new URL(configuredOrigin).origin !== origin
  )
    throw new RequestError(403, "Same-origin request required");
}
// Count bytes from the actual stream: Content-Length can be absent or dishonest.
export async function boundedJson(
  req: Pick<Request, "headers" | "body">,
  maxBytes: number,
  timeoutMs = 5000,
): Promise<unknown> {
  if (
    req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new RequestError(415, "JSON required");
  if (Number(req.headers.get("content-length")) > maxBytes)
    throw new RequestError(413, "Request too large");
  if (!req.body) throw new RequestError(400, "JSON required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (expired) throw new RequestError(408, "Request timed out");
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError(413, "Request too large");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestError(400, "Invalid JSON");
  }
}
export function boundedResult(value: unknown, maxBytes = 64000) {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > maxBytes)
    throw new RequestError(
      422,
      "Narrow the date range to reduce the result size",
    );
  return value;
}
export function authCookieOptions(origin: string) {
  const url = new URL(origin);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw Error("APP_ORIGIN must be an HTTPS origin (HTTP only on loopback)");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: url.protocol === "https:",
    path: "/",
  };
}
