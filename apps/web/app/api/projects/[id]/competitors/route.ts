import { isNonCompetitorDomain, isSelfDomain, parseDomainInput } from "@seo-maker/core/competitors";
import { assertSafeUrl } from "@seo-maker/core/net";
import { prisma } from "@seo-maker/db";
import { NextResponse } from "next/server";
import { enqueueCompetitorAnalyzeOne } from "@/lib/queue";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to add a competitor." }, { status: 401 });
  }

  const { id } = await params;
  const [project, account] = await Promise.all([
    getProjectForUser(id, userId),
    getAccountForUser(userId),
  ]);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (account.limits.maxCompetitors === 0) {
    return NextResponse.json(
      { error: "Upgrade your plan to track competitors." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    domain?: unknown;
    name?: unknown;
  } | null;
  const rawDomain = typeof body?.domain === "string" ? body.domain : "";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;

  const parsed = parseDomainInput(rawDomain);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (isSelfDomain(parsed.domain, project.rootUrl)) {
    return NextResponse.json({ error: "That is your own site." }, { status: 400 });
  }

  if (isNonCompetitorDomain(parsed.domain)) {
    return NextResponse.json(
      { error: "That domain is a directory or platform, not a competitor." },
      { status: 400 },
    );
  }

  // Deliberately generic: revealing *why* a host was blocked would leak whether
  // an internal address exists.
  const safe = await assertSafeUrl(parsed.url);
  if (!safe.ok) {
    return NextResponse.json({ error: "That domain cannot be analyzed." }, { status: 400 });
  }

  const existing = await prisma.competitor.findUnique({
    where: { projectId_domain: { projectId: project.id, domain: parsed.domain } },
  });

  if (existing && !existing.excluded) {
    return NextResponse.json({ error: "That competitor is already tracked." }, { status: 409 });
  }

  const tracked = await prisma.competitor.count({
    where: { projectId: project.id, excluded: false },
  });
  if (!existing && tracked >= account.limits.maxCompetitors) {
    return NextResponse.json(
      {
        error: `Your plan tracks up to ${account.limits.maxCompetitors} competitors. Remove one to add another.`,
      },
      { status: 403 },
    );
  }

  // Re-adding a previously removed competitor un-excludes it rather than
  // creating a duplicate the unique constraint would reject anyway.
  const competitor = await prisma.competitor.upsert({
    where: { projectId_domain: { projectId: project.id, domain: parsed.domain } },
    create: {
      projectId: project.id,
      domain: parsed.domain,
      name,
      source: "manual",
      status: "queued",
    },
    update: {
      excluded: false,
      status: "queued",
      statusError: null,
      crawlDone: 0,
      crawlTotal: 0,
      ...(name ? { name } : {}),
    },
  });

  try {
    await enqueueCompetitorAnalyzeOne({ projectId: project.id, competitorId: competitor.id });
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

  return NextResponse.json(
    {
      ok: true,
      competitor: {
        id: competitor.id,
        domain: competitor.domain,
        name: competitor.name,
        status: competitor.status,
      },
    },
    { status: existing ? 200 : 201 },
  );
}
