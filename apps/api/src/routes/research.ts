import { z } from "zod/v4";
import { respondError } from "../respond";
import type { FixtureStore, ResearchJob } from "../store";
import type { Router } from "../router";

const SubmitQuestionBody = z.object({
  question: z.string().min(1),
});

export function registerResearchRoutes(router: Router, store: FixtureStore): void {
  // POST /api/research — submit an ad-hoc research question
  router.post("/api/research", async (req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondError("Invalid JSON", 400);
    }
    const parsed = SubmitQuestionBody.safeParse(body);
    if (!parsed.success) return respondError("Invalid request body", 400);

    const job: ResearchJob = {
      id: `research-${Date.now()}`,
      question: parsed.data.question,
      status: "pending",
      answer: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    store.addResearchJob(job);

    // Fixture-first: immediately produce a stub answer so the UI can render it.
    const answered: ResearchJob = {
      ...job,
      status: "done",
      answer:
        "This is a fixture-mode stub answer. Connect a live LLM provider to get real responses.",
      completed_at: new Date().toISOString(),
    };
    store.updateResearchJob(job.id, answered);

    return Response.json(answered, { status: 202 });
  });

  // GET /api/research/:id — poll job status
  router.get("/api/research/:id", (_req, params) => {
    const job = store.researchJobs.find((j) => j.id === params.id);
    if (!job) return respondError("Research job not found", 404);
    return Response.json(job);
  });

  // GET /api/research — list recent research jobs
  router.get("/api/research", (_req, _params, url) => {
    const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);
    return Response.json(store.researchJobs.slice(-limit));
  });
}
