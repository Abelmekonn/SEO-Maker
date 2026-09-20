import { COMPETITOR_ACTIVE } from "@seo-maker/core/competitors";
import { prisma } from "@seo-maker/db";
import { NextResponse } from "next/server";
import { getCompetitorForUser } from "@/lib/competitors";
import { requireUserId } from "@/lib/projects";
import { enqueueCompetitorAnalyzeOne } from "@/lib/queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; competitorId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to analyze a competitor." }, { status: 401 });
  }

  const { id, competitorId } = await params;
  const competitor = await getCompetitorForUser(id, competitorId, userId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  if (COMPETITOR_ACTIVE.has(competitor.status)) {
    return NextResponse.json(
      { error: "This competitor is already being analyzed." },
      { status: 409 },
    );
  }

  await prisma.competitor.update({
    where: { id: competitor.id },
    data: { status: "queued", statusError: null, crawlDone: 0, crawlTotal: 0 },
  });

  try {
    await enqueueCompetitorAnalyzeOne({ projectId: id, competitorId: competitor.id });
  } catch (error) {
    console.error("Failed to enqueue competitor analysis", error);
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: { status: "failed", statusError: "Queue is not running." },
    });
    return NextResponse.json(
      { error: "Queue is not running. Start Redis and the worker." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
