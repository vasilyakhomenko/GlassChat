import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { proxyChat } = await import("@/lib/vellum/upstream.server");
        return proxyChat(request);
      },
    },
  },
});
