import type { RateGroup } from "../domain/types";
import { rateDisciplineDefinitions } from "../domain/calculation";

type LociaRateResponse = { rates: RateGroup[]; source: string; period: string | null; working_hours: number };

export async function loadLociaRates(current: RateGroup[]): Promise<{ rates: RateGroup[]; notice: string } | null> {
  if (typeof window === "undefined" || "__TAURI_INTERNALS__" in window) return null;
  const response = await fetch("/calculator/api/rates", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as LociaRateResponse;
  if (!payload.rates?.length) return null;
  const incoming = new Map(payload.rates.map((rate) => [rate.code, rate]));
  const expanded = new Map(current.map((rate) => [rate.code, rate]));
  for (const [code, rate] of incoming) {
    const definition = rateDisciplineDefinitions.find((item) => item.code === code || item.codes.includes(code));
    for (const target of definition ? [definition.code, ...definition.codes] : [code]) {
      expanded.set(target, { ...(expanded.get(target) ?? rate), code: target, monthlySalaryMedian: rate.monthlySalaryMedian, comment: rate.comment });
    }
  }
  const source = payload.source === "staffing" ? "утверждённого штатного расписания" : "единых ставок Лоции";
  return { rates: Array.from(expanded.values()), notice: `Ставки загружены из ${source}${payload.period ? ` за ${payload.period}` : ""}` };
}
