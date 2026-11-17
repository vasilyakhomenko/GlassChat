import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/models")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { proxyModels } = await import("@/lib/vellum/upstream.server");
        return proxyModels(request);
      },
    },
  },
});
