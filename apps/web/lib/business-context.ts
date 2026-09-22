import type { Prisma } from "@seo-maker/db";

/**
 * Business context for Deep analysis (Phase 0.5 / 0.6).
 *
 * Every field is optional on purpose: Quick mode must work from a URL alone,
 * and the AI layer is required to stay conservative where context is missing
 * rather than invent a business it cannot see.
 */

export type AnalysisMode = "quick" | "deep";

export type BusinessContext = {
  businessName: string | null;
  businessType: string | null;
  industry: string | null;
  businessDescription: string | null;
  targetAudience: string | null;
  targetLocation: string | null;
  servicesProducts: string[];
  primaryGoal: string | null;
  targetKeywords: string[];
};

export const EMPTY_CONTEXT: BusinessContext = {
  businessName: null,
  businessType: null,
  industry: null,
  businessDescription: null,
  targetAudience: null,
  targetLocation: null,
  servicesProducts: [],
  primaryGoal: null,
  targetKeywords: [],
};

const TEXT_LIMITS: Record<string, number> = {
  businessName: 120,
  businessType: 80,
  industry: 80,
  businessDescription: 2000,
  targetAudience: 400,
  targetLocation: 200,
  primaryGoal: 400,
};

const MAX_LIST_ITEMS = 25;
const MAX_LIST_ITEM_LENGTH = 120;

export function isAnalysisMode(value: unknown): value is AnalysisMode {
  return value === "quick" || value === "deep";
}

function text(value: unknown, field: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().slice(0, TEXT_LIMITS[field] ?? 200);
  return trimmed.length > 0 ? trimmed : null;
}

/** Accepts an array or a comma/newline separated string, which is what forms send. */
function list(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];

  const items: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim().slice(0, MAX_LIST_ITEM_LENGTH);
    if (trimmed && !items.includes(trimmed)) {
      items.push(trimmed);
    }
    if (items.length >= MAX_LIST_ITEMS) {
      break;
    }
  }
  return items;
}

/** Normalizes untrusted request input into a storable context. */
export function parseBusinessContext(input: unknown): BusinessContext {
  if (!input || typeof input !== "object") {
    return EMPTY_CONTEXT;
  }
  const body = input as Record<string, unknown>;
  return {
    businessName: text(body.businessName, "businessName"),
    businessType: text(body.businessType, "businessType"),
    industry: text(body.industry, "industry"),
    businessDescription: text(body.businessDescription, "businessDescription"),
    targetAudience: text(body.targetAudience, "targetAudience"),
    targetLocation: text(body.targetLocation, "targetLocation"),
    servicesProducts: list(body.servicesProducts),
    primaryGoal: text(body.primaryGoal, "primaryGoal"),
    targetKeywords: list(body.targetKeywords),
  };
}

export function contextToPrisma(context: BusinessContext) {
  return {
    businessName: context.businessName,
    businessType: context.businessType,
    industry: context.industry,
    businessDescription: context.businessDescription,
    targetAudience: context.targetAudience,
    targetLocation: context.targetLocation,
    servicesProducts: context.servicesProducts as unknown as Prisma.InputJsonValue,
    primaryGoal: context.primaryGoal,
    targetKeywords: context.targetKeywords as unknown as Prisma.InputJsonValue,
  };
}

/** Reads context back off a project row without trusting the JSON columns. */
export function readBusinessContext(project: {
  businessName: string | null;
  businessType: string | null;
  industry: string | null;
  businessDescription: string | null;
  targetAudience: string | null;
  targetLocation: string | null;
  servicesProducts: unknown;
  primaryGoal: string | null;
  targetKeywords: unknown;
}): BusinessContext {
  return {
    businessName: project.businessName,
    businessType: project.businessType,
    industry: project.industry,
    businessDescription: project.businessDescription,
    targetAudience: project.targetAudience,
    targetLocation: project.targetLocation,
    servicesProducts: list(project.servicesProducts),
    primaryGoal: project.primaryGoal,
    targetKeywords: list(project.targetKeywords),
  };
}

export function hasAnyContext(context: BusinessContext): boolean {
  return (
    Boolean(
      context.businessName ??
        context.businessType ??
        context.industry ??
        context.businessDescription ??
        context.targetAudience ??
        context.targetLocation ??
        context.primaryGoal,
    ) ||
    context.servicesProducts.length > 0 ||
    context.targetKeywords.length > 0
  );
}

/**
 * How complete the context is, 0-1.
 *
 * Shown in the UI so the user can see what Deep mode still lacks, and used
 * later to decide how confident an AI recommendation is allowed to be.
 */
export function contextCompleteness(context: BusinessContext): number {
  const signals = [
    context.businessName,
    context.businessType ?? context.industry,
    context.businessDescription,
    context.targetAudience,
    context.targetLocation,
    context.primaryGoal,
    context.servicesProducts.length > 0 ? "y" : null,
  ];
  const filled = signals.filter(Boolean).length;
  return Math.round((filled / signals.length) * 100) / 100;
}
