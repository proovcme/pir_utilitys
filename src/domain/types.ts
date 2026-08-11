export type CalculationType = "ФОТ" | "Ручной" | "Подряд" | "% от общего" | "Заголовок" | string;
export type SbcCalculationMethod = "natural" | "constructionPercent";
export type FgisPirKind = "design" | "survey";

export interface ProjectInput {
  projectType?: string;
  address?: string;
  customer?: string;
  area: number;
  vatRate: number;
  commercialCoefficient: number;
  overheadRate: number;
  bufferRate: number;
  advanceRate: number;
  workStartMonth: string;
  workEndMonth: string;
  bankGuaranteeAnnualRate: number;
  sbcMethod: SbcCalculationMethod;
  sbcCollectionName: string;
  sbcBaseYear: string;
  sbcNaturalIndicator: number;
  sbcConstantA: number;
  sbcConstantB: number;
  sbcConstructionCost: number;
  sbcDesignPercent: number;
  sbcIndexToCurrent: number;
  sbcComplexityCoefficient: number;
  sbcAdjustmentCoefficient: number;
  sbcPdShare: number;
  sbcRdShare: number;
  sbcBaseDurationDays: number;
  sbcDurationCoefficient: number;
  sbcFgisKind: FgisPirKind;
  sbcFgisNormGuid: string;
  sbcFgisPeriodId: number;
  sbcFgisPeriodLabel: string;
  sbcFgisApprovingAct: string;
  sbcFgisSourceUrl: string;
  sbcFgisCatalogSha256: string;
  sbcFgisTableCode?: string;
  sbcFgisTableTitle?: string;
  sbcFgisObjectName?: string;
  sbcFgisIndicatorUnit?: string;
  sbcFgisIndicatorRange?: string;
  sbcFgisTablePage?: number;
  sbcFgisBreakdownTableCode?: string;
  sbcFgisBreakdownObjectId?: string;
  rateMultiplier: number;
  roleStepRate: number;
  useGlobalCoefficient: boolean;
  globalCoefficient: number;
  useGlobalDuration: boolean;
  globalDurationDays: number;
  stageDurations?: Record<string, number>;
  computerCost: number;
  computerSalvageValue: number;
  computerUsefulLifeYears: number;
  insuranceContributionRate: number;
  includeCommon: boolean;
  presetPdOks: boolean;
  presetPdLinear: boolean;
  presetRdFull: boolean;
  presetRdCore: boolean;
  presetRdFrequent: boolean;
}

export interface EstimateLine {
  id: string;
  source: string | null;
  costGroup?: string | null;
  category: string | null;
  section: string | null;
  name: string | null;
  performer: string | null;
  staffRole?: string | null;
  departmentCode: string | null;
  calculationType: CalculationType | null;
  presetPdOks: boolean;
  presetPdLinear: boolean;
  presetRdFull: boolean;
  presetRdCore: boolean;
  presetRdFrequent: boolean;
  common: boolean;
  manualInclude: boolean;
  excluded: boolean;
  workUnits: number;
  chiefUnits?: number;
  leadUnits?: number;
  engineerUnits?: number;
  durationDays: number;
  manualAmount: number;
  coefficient: number;
  comment: string | null;
}

export interface RateGroup {
  code: string;
  group: string | null;
  monthlySalaryMedian: number;
  comment: string | null;
}

export interface PresetSet {
  name: string;
  controlCell: string | null;
  description: string | null;
  exclusionHint: string | null;
  lineIds?: string[];
}

export interface RdReferenceItem {
  number: number | string | null;
  mark: string;
  name: string | null;
  departmentCode: string | null;
  isCore: boolean;
  isFrequentPublicBuilding: boolean;
}

export interface Pp87ReferenceItem {
  type: string;
  number: number | string | null;
  mark: string | null;
  name: string;
  departmentCode: string | null;
  note: string | null;
}

export interface SeedCatalog {
  version: number;
  sourceWorkbook: string;
  projectInput: ProjectInput;
  lines: EstimateLine[];
  rates: RateGroup[];
  rdReference: RdReferenceItem[];
  pp87Reference: Pp87ReferenceItem[];
  presetSets: PresetSet[];
}

export interface Catalog {
  version: number;
  sourceWorkbook: string;
  lines: EstimateLine[];
  rates: RateGroup[];
  rdReference: RdReferenceItem[];
  pp87Reference: Pp87ReferenceItem[];
  presetSets: PresetSet[];
}

export interface CalculatedLine extends EstimateLine {
  selectedByPreset: boolean;
  active: boolean;
  monthlySalaryMedian: number;
  roleMultiplier: number;
  monthlyInsuranceContribution: number;
  monthlyDepreciation: number;
  fotEstimate: number;
  workCost: number;
  withBuffer: number;
  withCommercialCoefficient: number;
  costPerSquareMeter: number;
  warning: string | null;
  order: number | null;
}

export interface EstimateTotals {
  activeRows: number;
  directWorks: number;
  bufferAmount: number;
  totalWithBuffer: number;
  overheadAmount: number;
  totalWithOverhead: number;
  commercialMarkup: number;
  totalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
  costWithoutVatPerSquareMeter: number;
  costWithVatPerSquareMeter: number;
  warningCount: number;
  personDays: number;
}

export interface CashFlowRow {
  month: string;
  revenue: number;
  cost: number;
  bankGuaranteeCost: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

export interface FinanceSummary {
  advanceAmount: number;
  remainingAmount: number;
  bankGuaranteeAmount: number;
  bankGuaranteeCost: number;
  workMonths: number;
  cashFlow: CashFlowRow[];
}

export interface SbcResult {
  method: SbcCalculationMethod;
  collectionName: string;
  baseYear: string;
  basePrice: number;
  adjustedBasePrice: number;
  currentPriceWithoutVat: number;
  currentPriceWithVat: number;
  pdPriceWithoutVat: number;
  rdPriceWithoutVat: number;
  otherPriceWithoutVat: number;
  normativeDurationDays: number;
  differenceWithoutVat: number;
  differenceWithVat: number;
  ratioToSbc: number;
  notes: string[];
  officialBreakdown?: {
    tableCode: string;
    objectId: string;
    objectName: string;
    page: number;
    stageSourcePage: number;
    pdSharePercent: number;
    rdSharePercent: number;
    pdPublishedTotalPercent: number;
    rdPublishedTotalPercent: number;
    sections: Array<{
      code: string;
      name: string;
      pdSharePercent: number;
      rdSharePercent: number;
      combinedSharePercent: number;
      pdPriceWithoutVat: number;
      rdPriceWithoutVat: number;
      totalPriceWithoutVat: number;
    }>;
    pdUnallocatedWithoutVat: number;
    rdUnallocatedWithoutVat: number;
  };
}

export interface EstimateResult {
  project: ProjectInput;
  catalogVersion: number;
  lines: CalculatedLine[];
  activeLines: CalculatedLine[];
  totals: EstimateTotals;
  finance: FinanceSummary;
  sbc: SbcResult;
  bySource: Record<string, number>;
  byGroup: Record<string, number>;
  groupBreakdown: Array<{
    group: string;
    directWorks: number;
    totalWithoutVat: number;
    costPerSquareMeter: number;
    share: number;
    profit: number;
    profitRate: number;
  }>;
  warnings: string[];
}

export interface EstimateTemplate {
  id: string;
  name: string;
  description?: string;
  catalogVersion?: number;
  project: ProjectInput;
  lines: EstimateLine[];
  rates: RateGroup[];
  createdAt: string;
  updatedAt: string;
}

export interface CalculationSnapshot {
  id: string;
  name: string;
  project: ProjectInput;
  catalog: Catalog;
  result: EstimateResult;
  createdAt: string;
  exportedPath?: string;
}

export interface ExportOptions {
  fileName: string;
  includeAuditSheets: boolean;
}
