import type { CalculationSnapshot } from "../domain/types";
import { getLociaCsrfToken } from "./lociaRates";

const isBrowserLocia = () => typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

function monthStart(value: string) {
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null;
}

function monthEnd(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

async function post(path: string, body?: unknown) {
  const csrf = await getLociaCsrfToken();
  if (!csrf) return null;
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

export async function syncSnapshotToLocia(snapshot: CalculationSnapshot) {
  if (!isBrowserLocia()) return null;
  return post("/calculator/api/portfolio", {
    snapshot_id: snapshot.id,
    title: snapshot.project.projectType?.trim() || snapshot.name,
    amount_thousand: snapshot.result.totals.totalWithVat / 1000,
    area_m2: snapshot.project.area || null,
    start_date: monthStart(snapshot.project.workStartMonth),
    finish_date: monthEnd(snapshot.project.workEndMonth),
  });
}

export async function deleteSnapshotFromLocia(snapshotId: string) {
  if (!isBrowserLocia()) return null;
  return post(`/calculator/api/portfolio/${encodeURIComponent(snapshotId)}/delete`);
}
