import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PremiumPage } from "@/components/project/PremiumGate";
import { getAccountForUser } from "@/lib/plan";
import { premiumFeatures, type PremiumFeature } from "@/lib/premium";
import { requireUserId } from "@/lib/projects";

/** Returns the upgrade screen when the plan lacks the feature, or null when it includes it. */
export async function premiumGate(projectId: string, feature: PremiumFeature) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }
  const account = await getAccountForUser(userId);
  const entry = premiumFeatures[feature];
  if (entry.allowed(account.limits)) {
    return null;
  }
  return <PremiumPage projectId={projectId} title={entry.title} body={entry.body} unlocks={[...entry.unlocks]} />;
}

/** Wraps a premium-only screen. */
export async function PremiumRoute({
  projectId,
  feature,
  children,
}: {
  projectId: string;
  feature: PremiumFeature;
  children: ReactNode;
}) {
  return (await premiumGate(projectId, feature)) ?? children;
}
