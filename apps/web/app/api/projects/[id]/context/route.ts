import { NextResponse } from "next/server";
import { prisma } from "@seo-maker/db";
import {
  contextToPrisma,
  hasAnyContext,
  isAnalysisMode,
  parseBusinessContext,
  readBusinessContext,
} from "@/lib/business-context";
import { requireUserId } from "@/lib/projects";

/** Business context for Deep analysis (Phase 0.6): read and edit after creation. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view this project." }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    mode: project.analysisMode,
    business: readBusinessContext(project),
    updatedAt: project.contextUpdatedAt,
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to edit this project." }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const context = parseBusinessContext(body?.business ?? body);
  const mode = isAnalysisMode(body?.mode)
    ? body.mode
    : hasAnyContext(context)
      ? "deep"
      : "quick";

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      analysisMode: mode,
      ...contextToPrisma(context),
      contextUpdatedAt: hasAnyContext(context) ? new Date() : null,
    },
  });

  return NextResponse.json({
    ok: true,
    mode: updated.analysisMode,
    business: readBusinessContext(updated),
  });
}
