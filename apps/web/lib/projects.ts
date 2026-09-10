import { auth } from "@clerk/nextjs/server";
import { prisma } from "@seo-maker/db";

export async function requireUserId() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }
  return userId;
}

export async function getPageForUser(projectId: string, pageId: string, userId: string) {
  return prisma.page.findFirst({
    where: { id: pageId, projectId, project: { userId } },
    include: { project: true },
  });
}

export async function getProjectForUser(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    include: {
      pages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
