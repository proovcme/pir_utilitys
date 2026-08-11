import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import { calculateEstimate, seedToCatalog } from "../src/domain/calculation";
import {
  buildPirSummaryRows,
  calculatePirLabor,
  type PirEstimatePassport,
  type PirLaborInput,
} from "../src/domain/pirForms";
import { buildPirLaborWorkbook, buildPirSummaryWorkbook } from "../src/services/pirFormsExcel";

const passport: PirEstimatePassport = {
  constructionName: "Жилой дом",
  customer: "Заказчик",
  designOrganization: "Проектировщик",
  generalDesigner: "Генпроектировщик",
  priceLevelYear: 2026,
  estimate2pNumber: "1",
  estimate3pNumber: "2",
};

const labor: PirLaborInput = {
  sourceYear: 2025,
  averageWorkingDaysPerMonth: 20,
  ordinaryMonthlySalary: 100_000,
  specialMonthlySalary: 120_000,
  salarySource: "Росстат, 2025",
  profitabilityRate: 0.1,
  salaryShareInCost: 0.4,
  vatRate: 0.22,
  works: [{
    id: "work-1",
    name: "Раздел ООС",
    stage: "П",
    kind: "ordinary",
    plannedDurationDays: 10,
    basis: "Календарный план",
    participants: [{ id: "person-1", qualificationId: "text-7", actualDays: 5, headcount: 2 }],
  }],
};

describe("PIR forms 1P/2P/3P", () => {
  it("calculates form 3P by formulas 8.12-8.14", () => {
    const result = calculatePirLabor(labor);
    const work = result.works[0];

    expect(work.averageDailySalary).toBe(5_000);
    expect(work.averageDailyOutput).toBeCloseTo(13_750);
    expect(work.weightedPersonDays).toBe(10);
    expect(work.qualificationParticipationCoefficient).toBe(0.5);
    expect(work.costWithoutVat).toBeCloseTo(137_500);
    expect(work.costWithVat).toBeCloseTo(167_750);
    expect(work.valid).toBe(true);
  });

  it("keeps the qualification tables and salary bases separate", () => {
    const result = calculatePirLabor({
      ...labor,
      works: [{
        ...labor.works[0],
        kind: "bim",
        participants: [{ id: "bim-person", qualificationId: "bim-3", actualDays: 4, headcount: 1 }],
      }],
    }).works[0];

    expect(result.monthlySalary).toBe(120_000);
    expect(result.participants[0].qualification.table).toBe("1.4");
    expect(result.participants[0].qualification.index).toBe(1.84);
  });

  it("builds form 1P from linked 2P and 3P results", () => {
    const rows = buildPirSummaryRows(passport, "Жилой дом", 1_000_000, calculatePirLabor(labor), [], 0.22);

    expect(rows).toHaveLength(2);
    expect(rows[0].reference).toContain("форме 2П");
    expect(rows[1].reference).toContain("форме 3П");
    expect(rows.reduce((sum, item) => sum + item.costWithoutVat, 0)).toBeCloseTo(1_137_500);
  });

  it("exports auditable 3P and 1P workbooks", async () => {
    const laborBytes = await buildPirLaborWorkbook(passport, labor);
    const laborWorkbook = new ExcelJS.Workbook();
    await laborWorkbook.xlsx.load(Buffer.from(laborBytes));
    expect(laborWorkbook.getWorksheet("Форма 3П")).toBeDefined();
    expect(laborWorkbook.getWorksheet("Трудозатраты")).toBeDefined();
    expect(laborWorkbook.getWorksheet("Источники")).toBeDefined();
    expect(laborWorkbook.getWorksheet("Форма 3П")!.getCell("A1").value).toContain("форма 3П");

    const catalog = seedToCatalog(seedCatalog);
    const estimate = calculateEstimate(seedCatalog.projectInput, catalog);
    const summaryBytes = await buildPirSummaryWorkbook(passport, estimate.sbc, "Нормативный расчёт", labor, []);
    const summaryWorkbook = new ExcelJS.Workbook();
    await summaryWorkbook.xlsx.load(Buffer.from(summaryBytes));
    expect(summaryWorkbook.getWorksheet("Форма 1П")).toBeDefined();
    expect(summaryWorkbook.getWorksheet("Форма 1П")!.getCell("A1").value).toBe("Сводная смета на проектные работы (форма 1П)");
  });
});
