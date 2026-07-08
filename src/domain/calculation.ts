import type {
  CalculatedLine,
  CashFlowRow,
  Catalog,
  EstimateLine,
  EstimateResult,
  EstimateTotals,
  FinanceSummary,
  ProjectInput,
  RateGroup,
} from "./types";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const rateDisciplineDefinitions = [
  { code: "ЭОМ", title: "ЭОМ", description: "Вся электрика", codes: ["ЭОМ", "ЭО", "ЭМ"] },
  { code: "АСУ", title: "АСУ", description: "Вся автоматика", codes: ["АСУЗ", "ДИСП", "BMS", "АК", "АОВ", "АИТП", "АХС", "АСКУЭ", "АСКУВ", "АСКУТ", "АГСВ", "АПТ"] },
  { code: "СПЗ", title: "СПЗ", description: "Пожарная безопасность", codes: ["СПЗ", "ПС", "СОУЭ", "ПБ"] },
  { code: "ГИП", title: "ГИП", description: "Управление проектом", codes: ["ГИП"] },
  { code: "ТИМ", title: "ТИМ", description: "BIM / информационное моделирование", codes: ["ТИМ", "BIM"] },
  { code: "СМ", title: "СМ", description: "Сметчики", codes: ["СМ"] },
  { code: "ОВ", title: "ОВ", description: "Климат и противодымная вентиляция", codes: ["ОВ", "ОВ.ДУ", "ХС", "ИТП", "ТМ", "ТИ"] },
  { code: "СКС", title: "СКС", description: "Слаботочные сети", codes: ["СКС", "СС", "ЛВС", "ТФ", "РТ", "ЧФ"] },
  { code: "КСБ", title: "КСБ", description: "Комплексные системы безопасности", codes: ["КСБ", "СОТ", "СВН", "СКУД", "ОС"] },
  { code: "ВК", title: "ВК", description: "Водоснабжение и водоотведение", codes: ["ВК"] },
  { code: "ВПВ", title: "ВПВ", description: "Пожаротушение", codes: ["ВПВ", "ПТ", "АУПТ", "АГПТ", "АППТ", "АВПТ"] },
  { code: "АР", title: "АР", description: "Архитектура", codes: ["АР"] },
  { code: "КР", title: "КР", description: "Конструктив", codes: ["КР"] },
  { code: "ГП", title: "ГП", description: "Генеральный план", codes: ["ГП"] },
  { code: "ПОС", title: "ПОС", description: "Организация строительства", codes: ["ПОС"] },
  { code: "ООС", title: "ООС", description: "Охрана окружающей среды", codes: ["ООС"] },
  { code: "ТХ", title: "ТХ", description: "Технология", codes: ["ТХ"] },
  { code: "СБЭ", title: "СБЭ", description: "Безопасная эксплуатация", codes: ["СБЭ"] },
];

const activeByPreset = (line: EstimateLine, project: ProjectInput) =>
  (line.presetPdOks && project.presetPdOks) ||
  (line.presetPdLinear && project.presetPdLinear) ||
  (line.presetRdFull && project.presetRdFull) ||
  (line.presetRdCore && project.presetRdCore) ||
  (line.presetRdFrequent && project.presetRdFrequent) ||
  (line.common && project.includeCommon);

const buildRateMap = (rates: RateGroup[]) =>
  new Map(rates.map((rate) => [rate.code, rate.monthlySalaryMedian]));

export const getRateGroupCode = (code: string | null | undefined) => {
  if (!code) return null;
  const definition = rateDisciplineDefinitions.find((item) => item.code === code || item.codes.includes(code));
  return definition?.code ?? code;
};

export const getRateByGroupOrCode = (code: string | null, rates: RateGroup[]) => {
  if (!code) return 0;
  const rateMap = buildRateMap(rates);
  const definition = rateDisciplineDefinitions.find((item) => item.code === code);
  if (definition) {
    const values = definition.codes
      .map((itemCode) => rateMap.get(itemCode) ?? 0)
      .filter((value) => value > 0);
    if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const directRate = rateMap.get(code);
  return directRate && directRate > 0 ? directRate : 0;
};

export const normalizeCalculationType = (type: string | null | undefined) => {
  const value = String(type ?? "").trim();
  if (value === "ФО1") return "ФОТ";
  if (value === "Ручная сумма") return "Ручной";
  return value;
};

export const normalizeStaffRole = (role: string | null | undefined) => {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "главспец" || value === "главный специалист") return "Главспец";
  if (value === "инженер") return "Инженер";
  return "Ведущий";
};

export const getStaffRoleMultiplier = (role: string | null | undefined, roleStepRate = 0.15) => {
  const normalized = normalizeStaffRole(role);
  if (normalized === "Главспец") return 1 + roleStepRate;
  if (normalized === "Инженер") return Math.max(0, 1 - roleStepRate);
  return 1;
};

export const getLineStaffing = (line: EstimateLine) => {
  const hasExplicitStaffing =
    line.chiefUnits !== undefined ||
    line.leadUnits !== undefined ||
    line.engineerUnits !== undefined;
  if (hasExplicitStaffing) {
    return {
      chief: line.chiefUnits ?? 0,
      lead: line.leadUnits ?? 0,
      engineer: line.engineerUnits ?? 0,
    };
  }

  const role = normalizeStaffRole(line.staffRole);
  return {
    chief: role === "Главспец" ? line.workUnits : 0,
    lead: role === "Ведущий" ? line.workUnits : 0,
    engineer: role === "Инженер" ? line.workUnits : 0,
  };
};

const isFotType = (type: string | null | undefined) => normalizeCalculationType(type) === "ФОТ";
const isHeadingType = (type: string | null | undefined) => normalizeCalculationType(type) === "Заголовок";
const isManualType = (type: string | null | undefined) => normalizeCalculationType(type) === "Ручной";
const isPercentType = (type: string | null | undefined) => normalizeCalculationType(type) === "% от общего";

export function resolveCostGroup(line: EstimateLine) {
  if (line.costGroup) return line.costGroup;
  if (line.common || line.source === "Общие") return "Общие";
  if (line.source === "ПП87" || String(line.category ?? "").startsWith("ПД")) return "ПД";
  if (line.source === "РД" || line.category === "РД") return "РД";
  return line.category ?? line.source ?? "Прочее";
}

export function calculateMonthlyDepreciation(project: ProjectInput) {
  const usefulLifeYears = project.computerUsefulLifeYears ?? 3;
  const computerCost = project.computerCost ?? 150000;
  const salvageValue = project.computerSalvageValue ?? 0;
  if (usefulLifeYears <= 0) return 0;
  return Math.max(0, computerCost - salvageValue) / usefulLifeYears / 12;
}

const parseProjectMonth = (value: string | null | undefined) => {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
};

export function buildProjectMonths(startValue: string | null | undefined, endValue: string | null | undefined) {
  const start = parseProjectMonth(startValue);
  const end = parseProjectMonth(endValue);
  if (!start || !end) return [];
  const startIndex = start.year * 12 + start.month - 1;
  const endIndex = end.year * 12 + end.month - 1;
  if (endIndex < startIndex) return [];

  return Array.from({ length: endIndex - startIndex + 1 }, (_, index) => {
    const absoluteMonth = startIndex + index;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

export function calculateFinanceSummary(
  project: ProjectInput,
  totals: EstimateTotals,
  groupBreakdown: EstimateResult["groupBreakdown"],
): FinanceSummary {
  const months = buildProjectMonths(project.workStartMonth, project.workEndMonth);
  const workMonths = Math.max(1, months.length);
  const displayMonths = months.length ? months : [project.workStartMonth || "Месяц 1"];
  const advanceAmount = roundMoney(totals.totalWithVat * (project.advanceRate ?? 0));
  const remainingAmount = roundMoney(Math.max(0, totals.totalWithVat - advanceAmount));
  const bankGuaranteeAmount = advanceAmount;
  const bankGuaranteeCost = roundMoney(bankGuaranteeAmount * (project.bankGuaranteeAnnualRate ?? 0.03) * (workMonths / 12));
  const monthlyCost = totals.totalWithOverhead / workMonths;
  const pdStage = groupBreakdown.find((group) => group.group === "ПД");
  const rdStage = groupBreakdown.find((group) => group.group === "РД");
  const hasPdAndRd = Boolean(pdStage && rdStage);
  const pdPaymentIndex = Math.max(0, Math.min(workMonths - 1, Math.ceil(workMonths / 2) - 1));
  const finalPaymentIndex = workMonths - 1;
  const stagedRevenue = new Map<number, number>();

  if (hasPdAndRd && pdStage && rdStage) {
    const pdAndRdTotal = pdStage.totalWithoutVat + rdStage.totalWithoutVat;
    const pdShare = pdAndRdTotal > 0 ? pdStage.totalWithoutVat / pdAndRdTotal : 0.5;
    const pdPayment = roundMoney(remainingAmount * pdShare);
    stagedRevenue.set(pdPaymentIndex, (stagedRevenue.get(pdPaymentIndex) ?? 0) + pdPayment);
    stagedRevenue.set(finalPaymentIndex, (stagedRevenue.get(finalPaymentIndex) ?? 0) + roundMoney(remainingAmount - pdPayment));
  } else {
    stagedRevenue.set(finalPaymentIndex, remainingAmount);
  }

  let cumulativeCashFlow = 0;
  const cashFlow: CashFlowRow[] = displayMonths.map((month, index) => {
    const revenue = roundMoney((stagedRevenue.get(index) ?? 0) + (index === 0 ? advanceAmount : 0));
    const cost = roundMoney(monthlyCost);
    const rowGuaranteeCost = index === 0 ? bankGuaranteeCost : 0;
    const netCashFlow = roundMoney(revenue - cost - rowGuaranteeCost);
    cumulativeCashFlow = roundMoney(cumulativeCashFlow + netCashFlow);
    return {
      month,
      revenue,
      cost,
      bankGuaranteeCost: rowGuaranteeCost,
      netCashFlow,
      cumulativeCashFlow,
    };
  });

  return {
    advanceAmount,
    remainingAmount,
    bankGuaranteeAmount: roundMoney(bankGuaranteeAmount),
    bankGuaranteeCost,
    workMonths,
    cashFlow,
  };
}

export function calculateLine(
  line: EstimateLine,
  project: ProjectInput,
  rates: RateGroup[],
  index: number,
): CalculatedLine {
  const calculationType = normalizeCalculationType(line.calculationType);
  const staffRole = normalizeStaffRole(line.staffRole);
  const staffing = getLineStaffing(line);
  const totalWorkUnits = staffing.chief + staffing.lead + staffing.engineer;
  const roleMultiplier = totalWorkUnits > 0
    ? (
      staffing.chief * getStaffRoleMultiplier("Главспец", project.roleStepRate ?? 0.15) +
      staffing.lead +
      staffing.engineer * getStaffRoleMultiplier("Инженер", project.roleStepRate ?? 0.15)
    ) / totalWorkUnits
    : getStaffRoleMultiplier(staffRole, project.roleStepRate ?? 0.15);
  const selectedByPreset = activeByPreset(line, project);
  const active =
    !isHeadingType(calculationType) && !line.excluded && (selectedByPreset || line.manualInclude);
  const baseMonthlyRate = getRateByGroupOrCode(line.departmentCode, rates) * (project.rateMultiplier ?? 1);
  const monthlySalaryMedian = baseMonthlyRate * roleMultiplier;
  const monthlyInsuranceContribution = isFotType(calculationType)
    ? monthlySalaryMedian * (project.insuranceContributionRate ?? 0.302)
    : 0;
  const monthlyDepreciation = isFotType(calculationType) ? calculateMonthlyDepreciation(project) : 0;
  const monthlyCostBase =
    staffing.chief * (baseMonthlyRate * getStaffRoleMultiplier("Главспец", project.roleStepRate ?? 0.15) + monthlyDepreciation) +
    staffing.lead * (baseMonthlyRate + monthlyDepreciation) +
    staffing.engineer * (baseMonthlyRate * getStaffRoleMultiplier("Инженер", project.roleStepRate ?? 0.15) + monthlyDepreciation);
  const costGroup = resolveCostGroup(line);
  const durationDays = project.useGlobalDuration
    ? (project.globalDurationDays ?? line.durationDays)
    : line.durationDays;
  const coefficient = project.useGlobalCoefficient ? (project.globalCoefficient ?? line.coefficient) : line.coefficient;
  const fotEstimate = active
    ? (durationDays * monthlyCostBase) / 30
    : 0;
  const workCost = active ? (isManualType(line.calculationType) ? line.manualAmount : fotEstimate * coefficient) : 0;
  const withBuffer = active ? workCost * (1 + project.bufferRate) : 0;
  const withCommercialCoefficient = active ? withBuffer * project.commercialCoefficient : 0;
  const costPerSquareMeter = project.area > 0 ? withCommercialCoefficient / project.area : 0;
  const warning =
    active && isFotType(calculationType) && monthlySalaryMedian <= 0
      ? `Нет ставки для группы ${line.departmentCode ?? "без группы"}`
      : null;

  return {
    ...line,
    calculationType,
    staffRole,
    costGroup,
    selectedByPreset,
    active,
    workUnits: totalWorkUnits,
    chiefUnits: staffing.chief,
    leadUnits: staffing.lead,
    engineerUnits: staffing.engineer,
    monthlySalaryMedian: roundMoney(monthlySalaryMedian),
    roleMultiplier,
    monthlyInsuranceContribution: roundMoney(monthlyInsuranceContribution),
    monthlyDepreciation: roundMoney(monthlyDepreciation),
    durationDays,
    coefficient,
    fotEstimate: roundMoney(fotEstimate),
    workCost: roundMoney(workCost),
    withBuffer: roundMoney(withBuffer),
    withCommercialCoefficient: roundMoney(withCommercialCoefficient),
    costPerSquareMeter: roundMoney(costPerSquareMeter),
    warning,
    order: active ? index + 1 : null,
  };
}

export function calculateEstimate(project: ProjectInput, catalog: Catalog): EstimateResult {
  let order = 0;
  let lines = catalog.lines.map((line) => {
    const calculated = calculateLine(line, project, catalog.rates, order);
    if (calculated.active) order += 1;
    return { ...calculated, order: calculated.active ? order : null };
  });

  const baseDirectWorks = lines
    .filter((line) => line.active && !isPercentType(line.calculationType))
    .reduce((sum, line) => sum + line.workCost, 0);

  lines = lines.map((line) => {
    if (!line.active || !isPercentType(line.calculationType)) return line;
    const workCost = roundMoney(baseDirectWorks * (line.manualAmount / 100));
    const withBuffer = roundMoney(workCost * (1 + project.bufferRate));
    const withCommercialCoefficient = roundMoney(withBuffer * project.commercialCoefficient);
    return {
      ...line,
      workCost,
      fotEstimate: 0,
      withBuffer,
      withCommercialCoefficient,
      costPerSquareMeter: roundMoney(project.area > 0 ? withCommercialCoefficient / project.area : 0),
    };
  });

  const activeLines = lines.filter((line) => line.active);
  const directWorks = activeLines.reduce((sum, line) => sum + line.workCost, 0);
  const personDays = activeLines.reduce((sum, line) => (
    isFotType(line.calculationType) ? sum + line.workUnits * line.durationDays : sum
  ), 0);
  const bufferAmount = directWorks * project.bufferRate;
  const totalWithBuffer = directWorks + bufferAmount;
  const overheadAmount = totalWithBuffer * (project.overheadRate ?? 0.15);
  const totalWithOverhead = totalWithBuffer + overheadAmount;
  const totalWithoutVat = totalWithBuffer * project.commercialCoefficient;
  const commercialMarkup = totalWithoutVat - totalWithOverhead;
  const vatAmount = totalWithoutVat * project.vatRate;
  const totalWithVat = totalWithoutVat + vatAmount;
  const warningLines = lines.filter((line) => line.warning);
  const bySource = activeLines.reduce<Record<string, number>>((acc, line) => {
    const source = line.source ?? "Без источника";
    acc[source] = roundMoney((acc[source] ?? 0) + line.workCost);
    return acc;
  }, {});
  const byGroup = activeLines.reduce<Record<string, number>>((acc, line) => {
    const group = resolveCostGroup(line);
    acc[group] = roundMoney((acc[group] ?? 0) + line.workCost);
    return acc;
  }, {});
  const groupBreakdown = Object.entries(byGroup).map(([group, amount]) => {
    const share = directWorks > 0 ? amount / directWorks : 0;
    const groupTotalWithoutVat = totalWithoutVat * share;
    return {
      group,
      directWorks: roundMoney(amount),
      totalWithoutVat: roundMoney(groupTotalWithoutVat),
      costPerSquareMeter: roundMoney(project.area > 0 ? groupTotalWithoutVat / project.area : 0),
      share: roundMoney(share),
      profit: roundMoney(commercialMarkup * share),
      profitRate: roundMoney(amount > 0 ? (commercialMarkup * share) / amount : 0),
    };
  });

  const totals = {
    activeRows: activeLines.length,
    directWorks: roundMoney(directWorks),
    bufferAmount: roundMoney(bufferAmount),
    totalWithBuffer: roundMoney(totalWithBuffer),
    overheadAmount: roundMoney(overheadAmount),
    totalWithOverhead: roundMoney(totalWithOverhead),
    commercialMarkup: roundMoney(commercialMarkup),
    totalWithoutVat: roundMoney(totalWithoutVat),
    vatAmount: roundMoney(vatAmount),
    totalWithVat: roundMoney(totalWithVat),
    costWithoutVatPerSquareMeter: roundMoney(project.area > 0 ? totalWithoutVat / project.area : 0),
    costWithVatPerSquareMeter: roundMoney(project.area > 0 ? totalWithVat / project.area : 0),
    warningCount: warningLines.length,
    personDays: roundMoney(personDays),
  };

  return {
    project,
    catalogVersion: catalog.version,
    lines,
    activeLines,
    totals,
    finance: calculateFinanceSummary(project, totals, groupBreakdown),
    bySource,
    byGroup,
    groupBreakdown,
    warnings: warningLines.map((line) => `${line.id}: ${line.warning}`),
  };
}

export function seedToCatalog(seed: {
  version: number;
  sourceWorkbook: string;
  lines: EstimateLine[];
  rates: RateGroup[];
  rdReference: Catalog["rdReference"];
  pp87Reference: Catalog["pp87Reference"];
  presetSets: Catalog["presetSets"];
}): Catalog {
  return {
    version: seed.version,
    sourceWorkbook: seed.sourceWorkbook,
    lines: seed.lines,
    rates: seed.rates,
    rdReference: seed.rdReference,
    pp87Reference: seed.pp87Reference,
    presetSets: seed.presetSets,
  };
}
