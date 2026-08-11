import snapshotJson from "../data/fgisPirSnapshot.json";
import tablesJson from "../data/fgisPirTables.json";
import breakdownJson from "../data/fgisPirBreakdown.json";
import type { FgisPirKind, ProjectInput } from "./types";

export interface FgisPirDocument {
  guid: string;
  categoryGuid: string | null;
  category: string;
  name: string;
  approvingAct: string | null;
  priceLevel: string | null;
  index: number | null;
  filePath: string | null;
  kind: string;
  portalUrl: string;
  downloadUrl: string;
}

export interface FgisPirTree {
  hierarchy: Array<{
    guid: string;
    name: string;
    code: string;
    treePath: string;
    parentGuid: string | null;
  }>;
  documents: FgisPirDocument[];
}

export interface FgisPirPeriod {
  id: number;
  label: string;
  survey: FgisPirTree;
  design: FgisPirTree;
  indexes: FgisPirTree;
}

export interface FgisPirSnapshot {
  schemaVersion: number;
  fetchedAt: string;
  transport: string;
  source: {
    portalUrl: string;
    newsUrl: string;
    apiBase: string;
  };
  activePeriodId: number;
  periods: FgisPirPeriod[];
  methods: FgisPirTree;
  examples: FgisPirTree;
  archive: { methods: FgisPirTree; norms: FgisPirTree };
  counts: Record<string, number>;
  download: {
    documentCount: number;
    totalBytes: number;
    manifestSha256: string;
  };
  catalogSha256: string;
}

export interface FgisPirTableRow {
  id: string;
  number: string;
  objectName: string;
  rangeLabel: string;
  min: number | null;
  max: number | null;
  minInclusive: boolean;
  maxInclusive: boolean;
  unit: string;
  aThousandRub: number;
  bThousandRubPerUnit: number;
  page: number;
}

export interface FgisPirTable {
  code: string;
  title: string;
  page: number;
  rows: FgisPirTableRow[];
}

export interface FgisPirTableDocument {
  guid: string;
  sourcePdfSha256: string;
  tableCount: number;
  rowCount: number;
  tables: FgisPirTable[];
  percentTables: FgisPirPercentTable[];
}

export interface FgisPirPercentPoint {
  id: string;
  constructionCostMillionRub: number;
  designPercent: number;
  sourceLabel: string;
  page: number;
}

export interface FgisPirPercentTable {
  code: string;
  title: string;
  page: number;
  points: FgisPirPercentPoint[];
}

export interface FgisPirTableCatalog {
  schemaVersion: number;
  snapshotPeriod: string;
  extraction: string;
  documents: FgisPirTableDocument[];
}

export interface FgisPirBreakdownObject {
  id: string;
  name: string;
  page: number;
  stages: {
    pd: Record<string, number>;
    rd: Record<string, number>;
    combined: Record<string, number>;
  };
  totals: { pd: number; rd: number; combined: number };
}

export interface FgisPirBreakdownTable {
  code: string;
  priceTableCode: string;
  title: string;
  page: number;
  objects: FgisPirBreakdownObject[];
}

export interface FgisPirBreakdownDocument {
  guid: string;
  sourcePdfSha256: string;
  stageShares: { pd: number; rd: number; combined: number };
  stageSourcePage: number;
  tableCount: number;
  objectCount: number;
  tables: FgisPirBreakdownTable[];
}

export interface FgisPirBreakdownCatalog {
  schemaVersion: number;
  snapshotPeriod: string;
  extraction: string;
  sections: Array<{ code: string; name: string }>;
  documents: FgisPirBreakdownDocument[];
}

export interface FgisPirInterpolatedPercent {
  percent: number;
  lower: FgisPirPercentPoint;
  upper: FgisPirPercentPoint;
  clamped: "min" | "max" | null;
}

export interface FgisIndicatorExplanation {
  label: string;
  description: string;
  sourceHint: string;
}

export const fgisPirSnapshot = snapshotJson as FgisPirSnapshot;
export const fgisPirTableCatalog = tablesJson as FgisPirTableCatalog;
export const fgisPirBreakdownCatalog = breakdownJson as FgisPirBreakdownCatalog;

export function getFgisPeriod(periodId: number): FgisPirPeriod {
  return (
    fgisPirSnapshot.periods.find((period) => period.id === periodId) ??
    fgisPirSnapshot.periods.find((period) => period.id === fgisPirSnapshot.activePeriodId) ??
    fgisPirSnapshot.periods[0]
  );
}

export function getFgisDocuments(period: FgisPirPeriod, kind: FgisPirKind): FgisPirDocument[] {
  return period[kind].documents;
}

export function getFgisCategories(documents: FgisPirDocument[]): string[] {
  return Array.from(new Set(documents.map((document) => document.category))).sort((left, right) =>
    left.localeCompare(right, "ru", { numeric: true, sensitivity: "base" }),
  );
}

export function getFgisTableDocument(guid: string): FgisPirTableDocument | undefined {
  return fgisPirTableCatalog.documents.find((document) => document.guid === guid);
}

export function getFgisBreakdownDocument(guid: string): FgisPirBreakdownDocument | undefined {
  return fgisPirBreakdownCatalog.documents.find((document) => document.guid === guid);
}

export function getFgisBreakdownTable(
  document: FgisPirBreakdownDocument | undefined,
  priceTableCode: string | undefined,
): FgisPirBreakdownTable | undefined {
  if (!document || !priceTableCode || priceTableCode === "3.18") return undefined;
  return document.tables.find((table) => table.priceTableCode === priceTableCode);
}

const normalizedWords = (value: string) =>
  new Set(
    value
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .replace(/[^а-яa-z0-9]+/gi, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !["здание", "сооружение", "объект"].includes(word)),
  );

export function recommendFgisBreakdownObject(
  table: FgisPirBreakdownTable | undefined,
  objectName: string,
): FgisPirBreakdownObject | undefined {
  if (!table?.objects.length) return undefined;
  const sourceWords = normalizedWords(objectName);
  let best = table.objects[0];
  let bestScore = -1;
  for (const candidate of table.objects) {
    const candidateWords = normalizedWords(candidate.name);
    const common = [...sourceWords].filter((word) => candidateWords.has(word)).length;
    const score = common / Math.max(1, Math.min(sourceWords.size, candidateWords.size));
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function interpolateFgisPercent(
  table: FgisPirPercentTable,
  constructionCostRub: number,
): FgisPirInterpolatedPercent {
  const points = [...table.points].sort(
    (left, right) => left.constructionCostMillionRub - right.constructionCostMillionRub,
  );
  const costMillionRub = Math.max(0, constructionCostRub) / 1_000_000;
  const first = points[0];
  const last = points[points.length - 1];
  if (costMillionRub <= first.constructionCostMillionRub) {
    return { percent: first.designPercent, lower: first, upper: first, clamped: "min" };
  }
  if (costMillionRub >= last.constructionCostMillionRub) {
    return { percent: last.designPercent, lower: last, upper: last, clamped: "max" };
  }
  const upperIndex = points.findIndex((point) => point.constructionCostMillionRub >= costMillionRub);
  const upper = points[upperIndex];
  const lower = points[upperIndex - 1];
  const position =
    (costMillionRub - lower.constructionCostMillionRub) /
    (upper.constructionCostMillionRub - lower.constructionCostMillionRub);
  return {
    percent: lower.designPercent + (upper.designPercent - lower.designPercent) * position,
    lower,
    upper,
    clamped: null,
  };
}

export function getFgisTableObjects(table: FgisPirTable): string[] {
  return Array.from(
    new Set(
      table.rows
        .filter((row) => row.min !== null || row.max !== null)
        .map((row) => row.objectName),
    ),
  );
}

export function findFgisTableRow(
  table: FgisPirTable,
  objectName: string,
  indicator: number,
): FgisPirTableRow | undefined {
  return table.rows.find((row) => {
    if (row.objectName !== objectName) return false;
    const aboveMinimum =
      row.min === null || (row.minInclusive ? indicator >= row.min : indicator > row.min);
    const belowMaximum =
      row.max === null || (row.maxInclusive ? indicator <= row.max : indicator < row.max);
    return aboveMinimum && belowMaximum;
  });
}

export function explainFgisIndicator(
  unit: string,
  objectName = "",
): FgisIndicatorExplanation {
  const normalized = unit.toLocaleLowerCase("ru-RU");
  const normalizedObject = objectName.toLocaleLowerCase("ru-RU");
  const sourceHint = "Берите значение из задания на проектирование или утверждённых ТЭП и сверяйте определение показателя с выбранной таблицей норматива.";

  if (normalized.includes("куб")) {
    return {
      label: "Строительный объём объекта",
      description: "Введите строительный объём здания в кубических метрах.",
      sourceHint,
    };
  }
  if (normalized.includes("посад")) {
    return {
      label: "Количество посадочных мест",
      description: "Введите проектную вместимость объекта общественного питания в посадочных местах.",
      sourceHint,
    };
  }
  if (normalized.includes("зрител")) {
    return {
      label: "Вместимость трибун",
      description: "Введите количество зрителей, на которое рассчитаны трибуны.",
      sourceHint,
    };
  }
  if (normalized.includes("шт") && normalizedObject.includes("огнев")) {
    return {
      label: "Количество огневых позиций",
      description: "Введите число оборудованных огневых позиций стрелкового объекта.",
      sourceHint,
    };
  }
  if (normalized === "га") {
    return {
      label: "Площадь территории",
      description: "Введите площадь территории открытого объекта в гектарах.",
      sourceHint,
    };
  }
  if (normalized === "м" && normalizedObject.includes("горнолыж")) {
    return {
      label: "Протяжённость трассы",
      description: "Введите проектную длину горнолыжной трассы в метрах.",
      sourceHint,
    };
  }
  if (normalized === "м" && normalizedObject.includes("канатн")) {
    return {
      label: "Протяжённость канатной дороги",
      description: "Введите проектную длину линии канатной дороги в метрах.",
      sourceHint,
    };
  }
  if (normalized.includes("кв")) {
    return {
      label: "Общая площадь объекта",
      description: "Введите площадь проектируемого объекта в квадратных метрах, принятую для выбранного типа объекта.",
      sourceHint,
    };
  }
  if (normalized.includes("чел")) {
    return {
      label: "Численность населения",
      description: "Введите расчётную численность населения в человеках.",
      sourceHint,
    };
  }
  if (normalized.includes("мест")) {
    return {
      label: "Вместимость объекта",
      description: "Введите проектную вместимость объекта в единицах, указанных в нормативной таблице.",
      sourceHint,
    };
  }
  if (normalized === "км" || normalized === "м") {
    return {
      label: "Протяжённость объекта",
      description: `Введите проектную протяжённость объекта в ${normalized === "км" ? "километрах" : "метрах"}.`,
      sourceHint,
    };
  }
  if (normalized.includes("шт") || normalized.includes("объект")) {
    return {
      label: "Количество объектов",
      description: "Введите количество однотипных проектируемых объектов.",
      sourceHint,
    };
  }
  return {
    label: "Натуральный показатель X",
    description: `Введите физический объём объекта в единицах «${unit || "ед."}».`,
    sourceHint,
  };
}

export function indicatorLabelForUnit(unit: string): string {
  return explainFgisIndicator(unit).label;
}

export function projectPatchForFgisRow(
  table: FgisPirTable,
  row: FgisPirTableRow,
  indicator: number,
): Partial<ProjectInput> {
  const breakdownDocument = getFgisBreakdownDocument(
    fgisPirBreakdownCatalog.documents.find((document) =>
      document.tables.some((candidate) => candidate.priceTableCode === table.code),
    )?.guid ?? "",
  );
  const breakdownTable = getFgisBreakdownTable(breakdownDocument, table.code);
  const breakdownObject = recommendFgisBreakdownObject(breakdownTable, row.objectName);
  return {
    sbcMethod: "natural",
    sbcNaturalIndicator: indicator,
    sbcConstantA: row.aThousandRub * 1000,
    sbcConstantB: row.bThousandRubPerUnit * 1000,
    sbcFgisTableCode: table.code,
    sbcFgisTableTitle: table.title,
    sbcFgisObjectName: row.objectName,
    sbcFgisIndicatorUnit: row.unit,
    sbcFgisIndicatorRange: row.rangeLabel,
    sbcFgisTablePage: row.page,
    sbcFgisBreakdownTableCode: breakdownTable?.code,
    sbcFgisBreakdownObjectId: breakdownObject?.id,
  };
}

export function projectPatchForFgisPercentTable(
  table: FgisPirPercentTable,
  constructionCostRub: number,
): Partial<ProjectInput> {
  const interpolated = interpolateFgisPercent(table, constructionCostRub);
  const interval = interpolated.lower === interpolated.upper
    ? `${interpolated.lower.constructionCostMillionRub} млн ₽`
    : `${interpolated.lower.constructionCostMillionRub}–${interpolated.upper.constructionCostMillionRub} млн ₽`;
  return {
    sbcMethod: "constructionPercent",
    sbcConstructionCost: constructionCostRub,
    sbcDesignPercent: interpolated.percent / 100,
    sbcConstantA: 0,
    sbcConstantB: 0,
    sbcFgisTableCode: table.code,
    sbcFgisTableTitle: table.title,
    sbcFgisObjectName: "Объект, отсутствующий в таблицах 3.1–3.17",
    sbcFgisIndicatorUnit: "млн ₽",
    sbcFgisIndicatorRange: interval,
    sbcFgisTablePage: interpolated.lower.page,
  };
}

export function projectPatchForFgisDocument(
  project: ProjectInput,
  period: FgisPirPeriod,
  kind: FgisPirKind,
  document: FgisPirDocument,
): Partial<ProjectInput> {
  const breakdownDocument = getFgisBreakdownDocument(document.guid);
  return {
    sbcFgisKind: kind,
    sbcFgisNormGuid: document.guid,
    sbcFgisPeriodId: period.id,
    sbcFgisPeriodLabel: period.label,
    sbcFgisApprovingAct: document.approvingAct ?? "",
    sbcFgisSourceUrl: document.downloadUrl,
    sbcFgisCatalogSha256: fgisPirSnapshot.catalogSha256,
    sbcCollectionName: document.name,
    sbcBaseYear: document.priceLevel ?? project.sbcBaseYear,
    sbcIndexToCurrent: document.index ?? project.sbcIndexToCurrent,
    ...(breakdownDocument
      ? {
          sbcPdShare: breakdownDocument.stageShares.pd / 100,
          sbcRdShare: breakdownDocument.stageShares.rd / 100,
        }
      : {}),
  };
}

export function fgisSelectionIsCurrent(project: ProjectInput): boolean {
  return (
    project.sbcFgisPeriodId === fgisPirSnapshot.activePeriodId &&
    project.sbcFgisCatalogSha256 === fgisPirSnapshot.catalogSha256
  );
}
