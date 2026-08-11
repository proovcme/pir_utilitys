export type PirWorkKind = "ordinary" | "special" | "bim";

export interface PirEstimatePassport {
  constructionName: string;
  customer: string;
  designOrganization: string;
  generalDesigner: string;
  priceLevelYear: number;
  estimate2pNumber: string;
  estimate3pNumber: string;
}

export interface PirQualification {
  id: string;
  title: string;
  index: number;
  table: "1.3" | "1.4";
}

export interface PirLaborParticipant {
  id: string;
  qualificationId: string;
  actualDays: number;
  headcount: number;
}

export interface PirLaborWork {
  id: string;
  name: string;
  stage: string;
  kind: PirWorkKind;
  plannedDurationDays: number;
  basis: string;
  participants: PirLaborParticipant[];
}

export interface PirLaborInput {
  sourceYear: number;
  averageWorkingDaysPerMonth: number;
  ordinaryMonthlySalary: number;
  specialMonthlySalary: number;
  salarySource: string;
  profitabilityRate: number;
  salaryShareInCost: number;
  vatRate: number;
  works: PirLaborWork[];
}

export interface PirLaborParticipantResult extends PirLaborParticipant {
  qualification: PirQualification;
  weightedPersonDays: number;
}

export interface PirLaborWorkResult {
  work: PirLaborWork;
  participants: PirLaborParticipantResult[];
  monthlySalary: number;
  averageDailySalary: number;
  averageDailyOutput: number;
  totalHeadcount: number;
  qualificationParticipationCoefficient: number;
  weightedPersonDays: number;
  costWithoutVat: number;
  vatAmount: number;
  costWithVat: number;
  warnings: string[];
  valid: boolean;
}

export interface PirLaborResult {
  works: PirLaborWorkResult[];
  totalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
  totalWeightedPersonDays: number;
  warningCount: number;
  warnings: string[];
}

export interface PirSummaryExtra {
  id: string;
  name: string;
  characteristic: string;
  reference: string;
  costWithoutVat: number;
}

export interface PirSummaryRow {
  id: string;
  name: string;
  characteristic: string;
  reference: string;
  costWithoutVat: number;
  vatAmount: number;
  costWithVat: number;
  source: "2p" | "3p" | "manual";
}

export const TEXT_QUALIFICATIONS: PirQualification[] = [
  { id: "text-1", title: "Начальник мастерской, отделения, отдела, лаборатории", index: 2.25, table: "1.3" },
  { id: "text-2", title: "Комплексный ГАП, комплексный ГИП, руководитель проекта, главный научный сотрудник", index: 2, table: "1.3" },
  { id: "text-3", title: "Заместитель начальника мастерской, отделения, отдела, лаборатории", index: 1.8, table: "1.3" },
  { id: "text-4", title: "ГАП, ГИП, заведующий сектором, ведущий научный сотрудник", index: 1.6, table: "1.3" },
  { id: "text-5", title: "Главный специалист, старший научный сотрудник", index: 1.32, table: "1.3" },
  { id: "text-6", title: "Руководитель группы, заведующий группой", index: 1.3, table: "1.3" },
  { id: "text-7", title: "Ведущий специалист, научный сотрудник", index: 1, table: "1.3" },
  { id: "text-8", title: "Специалист I категории, младший научный сотрудник", index: 0.9, table: "1.3" },
  { id: "text-9", title: "Специалист II категории", index: 0.75, table: "1.3" },
  { id: "text-10", title: "Специалист III категории", index: 0.65, table: "1.3" },
  { id: "text-11", title: "Архитектор, инженер, экономист, специалист без категории", index: 0.6, table: "1.3" },
  { id: "text-12", title: "Техник", index: 0.45, table: "1.3" },
];

export const BIM_QUALIFICATIONS: PirQualification[] = [
  { id: "bim-1", title: "ТИМ-эксперт, руководитель отдела ТИМ, ТИМ-директор, ТИМ-консультант", index: 2.5, table: "1.4" },
  { id: "bim-2", title: "ТИМ-менеджер, ведущий или главный специалист отдела ТИМ, менеджер проекта ИМ", index: 2.25, table: "1.4" },
  { id: "bim-3", title: "ТИМ-координатор, специалист отдела ТИМ", index: 1.84, table: "1.4" },
  { id: "bim-4", title: "ТИМ-исполнитель, разработчик или оператор информационной модели, ТИМ-проектировщик", index: 1.75, table: "1.4" },
  { id: "bim-5", title: "ТИМ-мастер, технический специалист, ТИМ-техник", index: 1.42, table: "1.4" },
];

export const DEFAULT_PIR_PASSPORT: PirEstimatePassport = {
  constructionName: "",
  customer: "",
  designOrganization: "",
  generalDesigner: "",
  priceLevelYear: new Date().getFullYear(),
  estimate2pNumber: "1",
  estimate3pNumber: "2",
};

export function createPirLaborParticipant(kind: PirWorkKind = "ordinary"): PirLaborParticipant {
  return {
    id: crypto.randomUUID(),
    qualificationId: kind === "bim" ? BIM_QUALIFICATIONS[3].id : TEXT_QUALIFICATIONS[7].id,
    actualDays: 0,
    headcount: 1,
  };
}

export function createPirLaborWork(): PirLaborWork {
  return {
    id: crypto.randomUUID(),
    name: "",
    stage: "П",
    kind: "ordinary",
    plannedDurationDays: 0,
    basis: "",
    participants: [createPirLaborParticipant()],
  };
}

export const DEFAULT_PIR_LABOR_INPUT: PirLaborInput = {
  sourceYear: new Date().getFullYear() - 1,
  averageWorkingDaysPerMonth: 0,
  ordinaryMonthlySalary: 0,
  specialMonthlySalary: 0,
  salarySource: "",
  profitabilityRate: 0.1,
  salaryShareInCost: 0.4,
  vatRate: 0.22,
  works: [createPirLaborWork()],
};

export function qualificationsForWork(kind: PirWorkKind) {
  return kind === "bim" ? BIM_QUALIFICATIONS : TEXT_QUALIFICATIONS;
}

export function workKindLabel(kind: PirWorkKind) {
  if (kind === "bim") return "Информационная модель";
  if (kind === "special") return "Особо опасный, технически сложный или уникальный объект";
  return "Обычная проектная документация";
}

export function calculatePirLabor(input: PirLaborInput): PirLaborResult {
  const workingDays = Math.max(0, input.averageWorkingDaysPerMonth);
  const profitabilityRate = Math.max(0, input.profitabilityRate);
  const salaryShare = Math.max(0, input.salaryShareInCost);
  const vatRate = Math.max(0, input.vatRate);

  const works = input.works.map((work): PirLaborWorkResult => {
    const qualifications = qualificationsForWork(work.kind);
    const participants = work.participants.map((participant) => {
      const qualification = qualifications.find((item) => item.id === participant.qualificationId)
        ?? qualifications[0];
      const actualDays = Math.max(0, participant.actualDays);
      const headcount = Math.max(0, participant.headcount);
      return {
        ...participant,
        actualDays,
        headcount,
        qualification,
        weightedPersonDays: actualDays * headcount * qualification.index,
      };
    });
    const monthlySalary = work.kind === "ordinary"
      ? Math.max(0, input.ordinaryMonthlySalary)
      : Math.max(0, input.specialMonthlySalary);
    const averageDailySalary = workingDays > 0 ? monthlySalary / workingDays : 0;
    const averageDailyOutput = salaryShare > 0
      ? averageDailySalary * (1 + profitabilityRate) / salaryShare
      : 0;
    const totalHeadcount = participants.reduce((sum, item) => sum + item.headcount, 0);
    const weightedPersonDays = participants.reduce((sum, item) => sum + item.weightedPersonDays, 0);
    const plannedDuration = Math.max(0, work.plannedDurationDays);
    const qualificationParticipationCoefficient = plannedDuration > 0 && totalHeadcount > 0
      ? weightedPersonDays / (plannedDuration * totalHeadcount)
      : 0;
    const costWithoutVat = averageDailyOutput * plannedDuration * totalHeadcount
      * qualificationParticipationCoefficient;
    const vatAmount = costWithoutVat * vatRate;
    const warnings: string[] = [];
    if (!work.name.trim()) warnings.push("Укажите наименование работы.");
    if (!work.basis.trim()) warnings.push("Укажите основание трудозатрат.");
    if (monthlySalary <= 0) warnings.push(`Укажите среднюю зарплату по ОКВЭД ${work.kind === "ordinary" ? "71.11" : "71.12"}.`);
    if (workingDays <= 0) warnings.push("Укажите среднее число рабочих дней в месяце.");
    if (plannedDuration <= 0) warnings.push("Укажите плановую продолжительность.");
    if (participants.length === 0 || weightedPersonDays <= 0) warnings.push("Добавьте исполнителей и дни участия.");

    return {
      work,
      participants,
      monthlySalary,
      averageDailySalary,
      averageDailyOutput,
      totalHeadcount,
      qualificationParticipationCoefficient,
      weightedPersonDays,
      costWithoutVat,
      vatAmount,
      costWithVat: costWithoutVat + vatAmount,
      warnings,
      valid: warnings.length === 0,
    };
  });

  const totalWithoutVat = works.reduce((sum, item) => sum + item.costWithoutVat, 0);
  const vatAmount = totalWithoutVat * vatRate;
  const warnings: string[] = [];
  if (!input.salarySource.trim()) warnings.push("Укажите источник данных Росстата о средней зарплате.");
  if (input.sourceYear <= 0) warnings.push("Укажите год данных о средней зарплате.");
  return {
    works,
    totalWithoutVat,
    vatAmount,
    totalWithVat: totalWithoutVat + vatAmount,
    totalWeightedPersonDays: works.reduce((sum, item) => sum + item.weightedPersonDays, 0),
    warningCount: warnings.length + works.reduce((sum, item) => sum + item.warnings.length, 0),
    warnings,
  };
}

export function buildPirSummaryRows(
  passport: PirEstimatePassport,
  form2pName: string,
  form2pCostWithoutVat: number,
  laborResult: PirLaborResult,
  extras: PirSummaryExtra[],
  vatRate: number,
): PirSummaryRow[] {
  const rows: PirSummaryRow[] = [];
  const safeVat = Math.max(0, vatRate);
  if (form2pCostWithoutVat > 0) {
    const vatAmount = form2pCostWithoutVat * safeVat;
    rows.push({
      id: "form-2p",
      name: "Проектные работы по нормативу",
      characteristic: form2pName || passport.constructionName || "Нормативный расчёт",
      reference: `Смета № ${passport.estimate2pNumber || "—"} по форме 2П`,
      costWithoutVat: form2pCostWithoutVat,
      vatAmount,
      costWithVat: form2pCostWithoutVat + vatAmount,
      source: "2p",
    });
  }
  laborResult.works.forEach((item, index) => {
    if (item.costWithoutVat <= 0) return;
    rows.push({
      id: `form-3p-${item.work.id}`,
      name: item.work.name || `Работа ${index + 1}`,
      characteristic: `${item.work.stage}; ${workKindLabel(item.work.kind)}`,
      reference: `Калькуляция № ${passport.estimate3pNumber || "—"}.${index + 1} по форме 3П`,
      costWithoutVat: item.costWithoutVat,
      vatAmount: item.vatAmount,
      costWithVat: item.costWithVat,
      source: "3p",
    });
  });
  extras.forEach((item) => {
    const costWithoutVat = Math.max(0, item.costWithoutVat);
    const vatAmount = costWithoutVat * safeVat;
    rows.push({
      ...item,
      costWithoutVat,
      vatAmount,
      costWithVat: costWithoutVat + vatAmount,
      source: "manual",
    });
  });
  return rows;
}
