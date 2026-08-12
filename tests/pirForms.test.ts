import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import { calculateEstimate, seedToCatalog } from "../src/domain/calculation";
import {
  buildPirSummaryRows,
  calculatePirLabor,
  calculatePirTravel,
  type PirEstimatePassport,
  type PirLaborInput,
  type PirTravelInput,
} from "../src/domain/pirForms";
import { buildPirLaborWorkbook, buildPirSummaryWorkbook, buildPirTravelWorkbook } from "../src/services/pirFormsExcel";

const passport: PirEstimatePassport = {
  constructionName: "Жилой дом",
  customer: "Заказчик",
  designOrganization: "Проектировщик",
  generalDesigner: "Генпроектировщик",
  priceLevelQuarter: 2,
  priceLevelYear: 2026,
  estimate2pNumber: "1",
  estimate3pNumber: "2",
  estimate4pNumber: "3",
};

const labor: PirLaborInput = {
  sourceYear: 2025,
  averageWorkingDaysPerMonth: 20,
  ordinaryMonthlySalary: 100_000,
  specialMonthlySalary: 120_000,
  salarySource: "Росстат, 2025",
  priceIndex: 1,
  priceIndexSource: "Письмо Минстроя России",
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

const travel: PirTravelInput = {
  trips: [{
    id: "trip-1",
    destination: "Санкт-Петербург",
    specialists: 2,
    roundTripFarePerPerson: 10_000,
    hotelPerPersonNight: 5_000,
    perDiemPerPersonDay: 1_000,
    tripDays: 3,
    hotelNights: 2,
    basis: "Билеты и предложение гостиницы",
  }],
};

describe("PIR forms 2P/3P/4P and project summary", () => {
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

  it("reproduces the official FGIS form 3P example with prescribed rounding", () => {
    const example: PirLaborInput = {
      ...labor,
      sourceYear: 2024,
      averageWorkingDaysPerMonth: 20.67,
      ordinaryMonthlySalary: 118_335.1,
      priceIndex: 1,
      works: [{
        ...labor.works[0],
        plannedDurationDays: 15,
        participants: [
          ["text-1", 0.37], ["text-3", 0.35], ["text-4", 0.7],
          ["text-5", 1.91], ["text-6", 1.66], ["text-7", 9.29],
        ].map(([qualificationId, actualDays], index) => ({ id: `p-${index}`, qualificationId: String(qualificationId), actualDays: Number(actualDays), headcount: 1 })),
      }],
    };
    const result = calculatePirLabor(example).works[0];
    expect(result.averageDailySalary).toBe(5_724.97);
    expect(result.averageDailyOutput).toBe(15_743.67);
    expect(result.qualificationParticipationCoefficient).toBe(0.183);
    expect(result.baseCostWithoutVat).toBe(259_298.24);
  });

  it("blocks an unauditable 3P export state and participation beyond the planned term", () => {
    const result = calculatePirLabor({
      ...labor,
      priceIndexSource: "",
      works: [{ ...labor.works[0], plannedDurationDays: 2, participants: [{ ...labor.works[0].participants[0], actualDays: 3 }] }],
    });
    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.warnings).toContain("Укажите источник индекса пересчёта.");
    expect(result.works[0].valid).toBe(false);
    expect(result.works[0].warnings.join(" ")).toContain("не может превышать");
  });

  it("calculates form 4P by destination and number of specialists", () => {
    const result = calculatePirTravel(travel);
    expect(result.trips[0].fareTotal).toBe(20_000);
    expect(result.trips[0].hotelTotal).toBe(20_000);
    expect(result.trips[0].perDiemTotal).toBe(6_000);
    expect(result.total).toBe(46_000);
  });

  it("builds an explicit project summary from 2P, 3P and 4P results", () => {
    const rows = buildPirSummaryRows(passport, "Жилой дом", 1_000_000, calculatePirLabor(labor), calculatePirTravel(travel), [], 0.22);

    expect(rows).toHaveLength(3);
    expect(rows[0].characteristic).toContain("848/пр");
    expect(rows[1].characteristic).toContain("форме 3П");
    expect(rows[2].reference).toContain("форме 4П");
    expect(rows.reduce((sum, item) => sum + item.costWithoutVat, 0)).toBeCloseTo(1_183_500);
  });

  it("exports auditable 3P, 4P and project summary workbooks", async () => {
    const laborBytes = await buildPirLaborWorkbook(passport, labor);
    const laborWorkbook = new ExcelJS.Workbook();
    await laborWorkbook.xlsx.load(Buffer.from(laborBytes));
    expect(laborWorkbook.getWorksheet("Форма 3П")).toBeDefined();
    expect(laborWorkbook.getWorksheet("Трудозатраты")).toBeDefined();
    expect(laborWorkbook.getWorksheet("Источники")).toBeDefined();
    const form3p = laborWorkbook.getWorksheet("Форма 3П")!;
    expect(form3p.getCell("A1").value).toContain("форма 3П");
    expect(form3p.getCell("G15").value).toMatchObject({ formula: expect.stringContaining("ROUND") });
    expect(form3p.getCell("J19").value).toMatchObject({ formula: "ROUND(F19*G19*H19*I19,2)" });
    expect(laborWorkbook.getWorksheet("Пересчёт в 2П")!.getCell("D4").value).toMatchObject({ formula: "ROUND(B4*C4,2)" });

    const travelBytes = await buildPirTravelWorkbook(passport, travel);
    const travelWorkbook = new ExcelJS.Workbook();
    await travelWorkbook.xlsx.load(Buffer.from(travelBytes));
    expect(travelWorkbook.getWorksheet("Форма 4П")).toBeDefined();
    expect(travelWorkbook.getWorksheet("Основания")).toBeDefined();
    const form4p = travelWorkbook.getWorksheet("Форма 4П")!;
    expect(form4p.getCell("A1").value).toContain("форма 4П");
    expect(form4p.getCell("I12").value).toMatchObject({ formula: expect.stringContaining("C12*(D12") });

    const catalog = seedToCatalog(seedCatalog);
    const estimate = calculateEstimate(seedCatalog.projectInput, catalog);
    const summaryBytes = await buildPirSummaryWorkbook(passport, estimate.sbc, "Нормативный расчёт", labor, travel, [], ["form-2p", "form-4p"]);
    const summaryWorkbook = new ExcelJS.Workbook();
    await summaryWorkbook.xlsx.load(Buffer.from(summaryBytes));
    expect(summaryWorkbook.getWorksheet("Свод проекта")).toBeDefined();
    expect(summaryWorkbook.getWorksheet("Свод проекта")!.getCell("A1").value).toBe("Сводный расчёт стоимости проектных работ");
    expect(summaryWorkbook.getWorksheet("Свод проекта")!.getCell("B12").value).toBe("Нормативный расчёт");
    expect(summaryWorkbook.getWorksheet("Свод проекта")!.getCell("B13").value).toBe("Командировочные расходы");

    const form2pBytes = await buildPirSummaryWorkbook(passport, estimate.sbc, "Жилой дом", labor, travel, [], ["form-2p", "form-3p-work-1", "form-4p"], true);
    const form2pWorkbook = new ExcelJS.Workbook();
    await form2pWorkbook.xlsx.load(Buffer.from(form2pBytes));
    const form2p = form2pWorkbook.getWorksheet("Форма 2П")!;
    expect(form2p.getCell("A11").value).toBe("№ п/п");
    expect(form2p.getCell("E11").value).toBe("Сметная стоимость, руб.");
    expect(form2p.getColumn("B").values.map(String)).not.toContain("Командировочные расходы");
    expect(form2p.getCell("E14").value).toMatchObject({ formula: "SUM(E12:E13)" });
    expect(form2pWorkbook.getWorksheet("Расчёт по нормативу")).toBeDefined();
  });
});
