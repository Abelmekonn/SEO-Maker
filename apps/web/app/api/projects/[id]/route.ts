import { NextResponse } from "next/server";
import { getProjectForUser, requireUserId } from "@/lib/projects";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view this project." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project });
}
