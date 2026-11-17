import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "Что-то сломалось. Обновите страницу.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="boot">
      <TriangleAlert size={28} aria-hidden="true" />
      <h1 className="wordmark sm">Сбой</h1>
      <p className="lede">{errorMessage(error)}</p>
    </main>
  );
}
