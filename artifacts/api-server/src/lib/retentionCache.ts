/**
 * Lightweight helper to load project retention settings from the DB
 * and return a Map<projectId, RetentionConfig> for use in route handlers.
 * Falls back to { retentionApplicable: false, releasePercentage: 90 } for
 * any project not in the map (e.g., records with null projectId).
 */
import { db, projectsTable } from "@workspace/db";
import type { RetentionConfig } from "./businessLogic";

export const DEFAULT_RETENTION: RetentionConfig = {
  retentionApplicable: false,
  releasePercentage: 90,
};

export async function loadRetentionMap(): Promise<Map<number, RetentionConfig>> {
  const rows = await db
    .select({
      id: projectsTable.id,
      retentionApplicable: projectsTable.retentionApplicable,
      releasePercentage: projectsTable.releasePercentage,
    })
    .from(projectsTable);

  const map = new Map<number, RetentionConfig>();
  for (const row of rows) {
    map.set(row.id, {
      retentionApplicable: row.retentionApplicable,
      releasePercentage: parseFloat(String(row.releasePercentage)) || 90,
    });
  }
  return map;
}

export function getRetention(
  map: Map<number, RetentionConfig>,
  projectId: number | null | undefined,
): RetentionConfig {
  if (projectId == null) return DEFAULT_RETENTION;
  return map.get(projectId) ?? DEFAULT_RETENTION;
}
