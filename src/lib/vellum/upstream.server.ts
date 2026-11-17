import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { endpoint, friendlyHttpError } from "@/lib/vellum/urls";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

async function readJson(request: Request, max: number): Promise<unknown> {
  const claimed = Number(request.headers.get("content-length") || 0);
  if (claimed > max) throw new HttpError(413, "Слишком большой запрос");
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Слишком большой запрос");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const forwarded = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const candidates = [forwarded, host]
    .filter((value): value is string => !!value)
    .map((value) => value.split(",")[0]!.trim());
  return candidates.includes(originHost);
}

function isPrivateAddress(raw: string): boolean {
  let ip = raw.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    const a = parts[0]!;
    const b = parts[1]!;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (ip.includes(":")) {
    const head = ip.split(":")[0] ?? "";
    if (head === "" || head === "0") return true;
    if (head.startsWith("fc") || head.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(head)) return true;
    if (head.startsWith("ff")) return true;
  }
  return false;
}

function blockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host === "0.0.0.0" ||
    host === "metadata.google.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (isIP(host)) return isPrivateAddress(host);
  return false;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Некорректный адрес API");
  }
  if (url.username || url.password) throw new HttpError(400, "Уберите логин и пароль из адреса");
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError(400, "Разрешены только http и https");
  }
  if (blockedHostname(url.hostname)) {
    throw new HttpError(
      400,
      "Веб-прокси не ходит в локальную и частную сеть. Для Ollama включите прямой доступ или поставьте Android-сборку: она обращается к API сама.",
    );
  }
  if (!isIP(url.hostname)) {
    let records: { address: string }[];
    try {
      records = await lookup(url.hostname, { all: true, verbatim: true });
    } catch {
      throw new HttpError(502, "Не удалось найти адрес API");
    }
    if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
      throw new HttpError(400, "Адрес API указывает на частную сеть. Веб-прокси туда не ходит.");
    }
  }
  return url;
}

async function forward(url: string, init: RequestInit, hops = 0): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400 && hops < 2) {
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) return response;
    const next = new URL(location, url);
    await assertPublicUrl(next.toString());
    return forward(next.toString(), init, hops + 1);
  }
  return response;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function guarded(request: Request): Promise<{ baseUrl: string; apiKey: string; payload?: Record<string, unknown> }> {
  if (!sameOrigin(request)) throw new HttpError(403, "Чужой источник запроса");
  const body = record(await readJson(request, 8_000_000));
  if (!body || typeof body.baseUrl !== "string") throw new HttpError(400, "Нужен адрес API");
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const payload = body.payload === undefined ? undefined : record(body.payload) ?? undefined;
  if (body.payload !== undefined && !payload) throw new HttpError(400, "Некорректное тело запроса");
  return { baseUrl: body.baseUrl, apiKey, payload: payload ?? undefined };
}

function upstreamHeaders(apiKey: string, accept: string): Headers {
  const headers = new Headers();
  headers.set("accept", accept);
  if (apiKey.trim()) headers.set("authorization", `Bearer ${apiKey.trim()}`);
  headers.set("x-title", "Vellum");
  return headers;
}

export async function proxyModels(request: Request): Promise<Response> {
  try {
    const { baseUrl, apiKey } = await guarded(request);
    const url = await assertPublicUrl(endpoint(baseUrl, "models"));
    const timeout = AbortSignal.timeout(20_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const upstream = await forward(url.toString(), {
      method: "GET",
      headers: upstreamHeaders(apiKey, "application/json"),
      signal,
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return fail(upstream.status, friendlyHttpError(upstream.status, text));
    }
    let models: string[] = [];
    try {
      const data = JSON.parse(text) as { data?: { id?: string }[] };
      models = (data.data ?? [])
        .map((item) => (typeof item.id === "string" ? item.id : ""))
        .filter(Boolean)
        .slice(0, 500);
    } catch {
      return fail(502, "Провайдер прислал не список моделей");
    }
    return Response.json({ models });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.message);
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted) return fail(499, "Запрос остановлен");
    return fail(502, "Не удалось связаться с провайдером");
  }
}

export async function proxyChat(request: Request): Promise<Response> {
  try {
    const { baseUrl, apiKey, payload } = await guarded(request);
    if (!payload || typeof payload.model !== "string" || !Array.isArray(payload.messages)) {
      throw new HttpError(400, "Нужны model и messages");
    }
    const url = await assertPublicUrl(endpoint(baseUrl, "chat"));
    const timeout = AbortSignal.timeout(120_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const headers = upstreamHeaders(apiKey, "text/event-stream, application/json");
    headers.set("content-type", "application/json");
    const upstream = await forward(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    const type = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": type,
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.message);
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted) return fail(499, "Запрос остановлен");
    return fail(502, "Не удалось связаться с провайдером");
  }
}
