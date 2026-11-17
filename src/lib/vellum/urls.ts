export function endpoint(baseUrl: string, kind: "chat" | "models"): string {
  const clean = baseUrl.trim().replace(/\/+$/, "");
  if (kind === "chat" && /\/chat\/completions$/i.test(clean)) return clean;
  if (kind === "models" && /\/models$/i.test(clean)) return clean;
  if (kind === "models" && /\/chat\/completions$/i.test(clean)) {
    return clean.replace(/\/chat\/completions$/i, "/models");
  }
  const leaf = kind === "chat" ? "chat/completions" : "models";
  if (/\/v\d+$/i.test(clean)) return `${clean}/${leaf}`;
  return `${clean}/v1/${leaf}`;
}

function ipv4Private(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function prefersDirect(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host === "::1" || host === "0.0.0.0") return true;
    return ipv4Private(host);
  } catch {
    return false;
  }
}

export function friendlyHttpError(status: number, body: string): string {
  const clipped = body.replace(/\s+/g, " ").trim().slice(0, 500);
  try {
    const data = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || data.message;
    if (message) return message.slice(0, 500);
  } catch {
    /* provider sent plain text */
  }
  if (clipped) return clipped;
  return `Провайдер ответил ${status}`;
}
