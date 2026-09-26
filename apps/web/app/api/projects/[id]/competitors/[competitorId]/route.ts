import { prisma } from "@seo-maker/db";
import { NextResponse } from "next/server";
import { getCompetitorForUser } from "@/lib/competitors";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; competitorId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to update a competitor." }, { status: 401 });
  }

  const account = await getAccountForUser(userId);
  if (account.limits.maxCompetitors === 0) {
    return NextResponse.json({ error: "Upgrade your plan to track competitors." }, { status: 403 });
  }

  const { id, competitorId } = await params;
  const competitor = await getCompetitorForUser(id, competitorId, userId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    pinned?: unknown;
    excluded?: unknown;
    name?: unknown;
  } | null;

  const data: { pinned?: boolean; excluded?: boolean; name?: string | null } = {};
  if (typeof body?.pinned === "boolean") data.pinned = body.pinned;
  if (typeof body?.excluded === "boolean") data.excluded = body.excluded;
  if (typeof body?.name === "string") data.name = body.name.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await prisma.competitor.update({ where: { id: competitor.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; competitorId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to remove a competitor." }, { status: 401 });
  }

  const { id, competitorId } = await params;
  const competitor = await getCompetitorForUser(id, competitorId, userId);
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  const hard = new URL(request.url).searchParams.get("hard") === "1";
  if (hard) {
    await prisma.competitor.delete({ where: { id: competitor.id } });
  } else {
    // Soft remove, so a later discovery run cannot resurrect something the
    // user explicitly rejected.
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: { excluded: true, pinned: false },
    });
  }

  return NextResponse.json({ ok: true });
}
