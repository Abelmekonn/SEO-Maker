import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import { isOpportunityStatus } from "@/lib/opportunities";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";

/**
 * Sets the user's status on one opportunity: open, in-progress, done or
 * dismissed. This is the user's claim. Whether the crawl still finds the
 * condition is recorded separately (`resolvedAt`) and never overwritten here.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; opportunityId: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to update opportunities." }, { status: 401 });
  }
  const account = await getAccountForUser(userId);
  if (account.plan === "free") {
    return NextResponse.json({ error: "Site opportunities are part of the Pro and Agency plans.", upgrade: true }, { status: 402 });
  }

  const { id, opportunityId } = await params;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  if (!isOpportunityStatus(body?.status)) {
    return NextResponse.json({ error: "Status must be open, in-progress, done or dismissed." }, { status: 400 });
  }

  const updated = await prisma.opportunity.updateMany({
    where: { id: opportunityId, projectId: id, project: { userId } },
    data: { status: body.status },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: body.status });
}
