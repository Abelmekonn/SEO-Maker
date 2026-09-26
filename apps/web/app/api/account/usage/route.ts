import { NextResponse } from "next/server";
import { getUserQuota } from "@/lib/ai-access";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";

/**
 * The signed-in user's plan allowances: what their plan includes, and how
 * many AI generations they have left today and this week. Counts only;
 * tokens and cost never leave the server.
 */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your usage." }, { status: 401 });
  }
  const account = await getAccountForUser(userId);
  const quota = await getUserQuota(userId, account.limits);
  return NextResponse.json({
    plan: account.plan,
    label: account.limits.label,
    ai: {
      page: account.limits.ai,
      site: account.limits.siteAi,
      competitor: account.limits.competitorAi,
      homepageOnly: account.limits.aiHomepageOnly,
    },
    quota,
    recrawlsPerSite: account.limits.recrawlsPerSite,
  });
}
