import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import { calculateEstimate, seedToCatalog } from "../src/domain/calculation";
import { exportEstimateWorkbook } from "../src/services/excelExport";
import { buildPublicPirWorkbook } from "../src/services/publicPirExcel";
import type { CalculationSnapshot } from "../src/domain/types";

describe("exportEstimateWorkbook", () => {
  it("creates a valid workbook with formulas", async () => {
    const catalog = seedToCatalog(seedCatalog);
    const project = {
      ...seedCatalog.projectInput,
      sbcFgisNormGuid: "b90117ab-5223-4a7a-89ae-a8bcbb88f689",
      sbcFgisTableCode: "3.1",
      sbcFgisObjectName: "Индивидуальный жилой дом",
      sbcFgisBreakdownTableCode: "1",
      sbcFgisBreakdownObjectId: "1",
      sbcPdShare: 0.4,
      sbcRdShare: 0.6,
    };
    const snapshot: CalculationSnapshot = {
      id: "test",
      name: "Тестовая оценка",
      project,
      catalog,
      result: calculateEstimate(project, catalog),
      createdAt: new Date("2026-07-07T00:00:00.000Z").toISOString(),
    };

    const bytes = await exportEstimateWorkbook(snapshot, {
      fileName: "test.xlsx",
      includeAuditSheets: true,
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes));
    expect(workbook.getWorksheet("Итог")).toBeDefined();
    expect(workbook.getWorksheet("Оценка")).toBeDefined();
    expect(workbook.getWorksheet("Конструктор")).toBeDefined();
    expect(workbook.getWorksheet("Справочники")).toBeDefined();
    expect(workbook.getWorksheet("СБЦ ФГИС")).toBeDefined();
    expect(workbook.getWorksheet("Разделы ФГИС")).toBeDefined();

    const control = workbook.getWorksheet("Пульт")!;
    const summary = workbook.getWorksheet("Итог")!;
    const estimate = workbook.getWorksheet("Оценка")!;
    const constructor = workbook.getWorksheet("Конструктор")!;
    const sbc = workbook.getWorksheet("СБЦ ФГИС")!;
    const sbcBreakdown = workbook.getWorksheet("Разделы ФГИС")!;
    expect(control.getCell("B23").value).toMatchObject({ formula: "B21+B22" });
    expect(control.getCell("B28").value).toMatchObject({ formula: expect.stringContaining("SUMPRODUCT") });
    expect(summary.getCell("B5").value).toMatchObject({ formula: "'Пульт'!B28" });
    expect(summary.getCell("E4").value).toMatchObject({ formula: expect.stringContaining("SUMIFS") });
    expect(summary.getCell("J4").value).toMatchObject({ formula: "IFERROR(I4/E4,0)" });
    expect(summary.getCell("B16").value).toMatchObject({ formula: "'Пульт'!E21" });
    expect(summary.getCell("B19").value).toMatchObject({ formula: "'Пульт'!E25" });
    expect(summary.getCell("B24").value).toMatchObject({ formula: expect.stringContaining("'Пульт'!$E$29") });
    expect(control.getCell("E21").value).toMatchObject({ formula: "B23*E17" });
    expect(control.getCell("E25").value).toMatchObject({ formula: "E23*E24*E20/12" });
    expect(control.getCell("E27").value).toMatchObject({ formula: "MAX(1,ROUNDUP(E20/2,0))" });
    expect(constructor.getCell("R2").value).toMatchObject({ formula: expect.stringContaining("IF") });
    expect(constructor.getCell("W2").value).toMatchObject({ formula: expect.stringContaining("VLOOKUP") });
    expect(constructor.getCell("AA2").value).toMatchObject({ formula: expect.stringContaining("SUMIFS") });
    expect(constructor.getCell("AA2").value).toMatchObject({ formula: expect.stringContaining("Подряд") });
    expect(sbc.getCell("B18").value).toMatchObject({ formula: expect.stringContaining("ROUND(") });
    expect(sbc.getCell("B20").value).toMatchObject({ formula: "B19*B9" });
    expect(sbc.getCell("B22").value).toMatchObject({ formula: "B20*(1+B21)" });
    expect(sbc.getCell("B25").value).toMatchObject({ formula: "B20*B23/MAX(1,B23+B24)" });
    expect(sbc.getCell("B26").value).toMatchObject({ formula: "B20*B24/MAX(1,B23+B24)" });
    expect(sbc.getCell("C3").value).toBe("Расшифровка / методика");
    expect(String(sbc.getCell("C13").value)).toContain("Натуральный показатель X");
    expect(String(sbc.getCell("C20").value)).toContain("индекс ФГИС");
    expect(sbcBreakdown.getCell("A1").value).toBe("Нормативная стоимость ПД и РД по разделам");
    expect(String(sbcBreakdown.getCell("A3").value)).toContain("OVC.me");
    expect(sbcBreakdown.getCell("C5").value).toBe(0.005);
    expect(sbcBreakdown.getCell("D5").value).toMatchObject({ formula: "'СБЦ ФГИС'!$B$25*C5" });
    const firstEstimateIndex = estimate.getCell("A9").value;
    const firstEstimateCost = estimate.getCell("N9").value;
    expect(firstEstimateIndex).toMatchObject({ formula: expect.stringMatching(/^'Конструктор'!\$AG\d+$/) });
    expect(firstEstimateCost).toMatchObject({ formula: expect.stringMatching(/^'Конструктор'!\$AA\d+$/) });
    expect(String((firstEstimateIndex as ExcelJS.CellFormulaValue).formula).match(/\d+$/)?.[0])
      .toBe(String((firstEstimateCost as ExcelJS.CellFormulaValue).formula).match(/\d+$/)?.[0]);

    const formulaCounts: Record<string, number> = {};
    const badFormulaTexts: string[] = [];
    workbook.worksheets.forEach((sheet) => {
      let count = 0;
      sheet.eachRow((row) => row.eachCell((cell) => {
        const value = cell.value;
        if (value && typeof value === "object" && "formula" in value) {
          count += 1;
          const formulaText = String(value.formula);
          if (/#REF!|#VALUE!|#DIV\/0!|#NAME\?|#N\/A/.test(formulaText)) {
            badFormulaTexts.push(`${sheet.name}!${cell.address}: ${formulaText}`);
          }
        }
      }));
      formulaCounts[sheet.name] = count;
    });

    expect(formulaCounts["Итог"]).toBeGreaterThan(20);
    expect(formulaCounts["Оценка"]).toBeGreaterThan(snapshot.result.activeLines.length * 10);
    expect(formulaCounts["Конструктор"]).toBeGreaterThan(snapshot.catalog.lines.length * 8);
    expect(formulaCounts["Пульт"]).toBeGreaterThan(10);
    expect(badFormulaTexts).toEqual([]);

    const publicBytes = await buildPublicPirWorkbook(project, snapshot.result.sbc);
    const publicWorkbook = new ExcelJS.Workbook();
    await publicWorkbook.xlsx.load(Buffer.from(publicBytes));
    const publicCalculation = publicWorkbook.getWorksheet("Расчёт")!;
    const publicBreakdown = publicWorkbook.getWorksheet("Разделы")!;
    expect(publicCalculation.getCell("A1").value).toBe("Нормативный расчёт стоимости проектных работ");
    expect(publicCalculation.getCell("B19").value).toMatchObject({ formula: "B17*B18" });
    expect(publicBreakdown.getCell("D5").value).toMatchObject({ formula: "'Расчёт'!$B$21*C5" });
    expect(String(publicBreakdown.getCell("A3").value)).toContain("OVC.me");

    const bimProject = { ...project, sbcInformationModel: true, sbcBimObjectGroupId: 3 };
    const bimResult = calculateEstimate(bimProject, catalog).sbc;
    const bimBytes = await buildPublicPirWorkbook(bimProject, bimResult);
    const bimWorkbook = new ExcelJS.Workbook();
    await bimWorkbook.xlsx.load(Buffer.from(bimBytes));
    const bimCalculation = bimWorkbook.getWorksheet("Расчёт")!;
    expect(bimCalculation.getCell("B17").value).toMatchObject({ formula: expect.stringContaining("1.16") });
    expect(bimCalculation.getCell("B21").value).toMatchObject({ formula: expect.stringContaining("1.16") });
    expect(bimCalculation.getCell("B23").value).toMatchObject({ formula: expect.stringContaining("1.18") });
    const bimLabels = bimCalculation.getColumn("A").values.map(String);
    expect(bimLabels).toContain("Коэффициент BIM для П");
    expect(bimLabels).toContain("Коэффициент BIM для Р");

    const complexProject = {
      ...project,
      sbcComplexObject: true,
      sbcComplexRole: "main" as const,
      sbcComplexRoleCoefficient: 1,
      sbcComplexComponents: [
        {
          id: "main",
          name: "Основной жилой дом",
          pzuCoefficient: 1,
          input: { ...project, sbcComplexObject: true, sbcComplexRole: "main" as const, sbcComplexRoleCoefficient: 1 },
        },
        {
          id: "repeat",
          name: "Повторный жилой дом",
          pzuCoefficient: 0.5,
          input: { ...project, sbcComplexObject: true, sbcComplexRole: "repeated" as const, sbcComplexRoleCoefficient: 0.5 },
        },
      ],
    };
    const complexResult = calculateEstimate(complexProject, catalog).sbc;
    const complexBytes = await buildPublicPirWorkbook(complexProject, complexResult);
    const complexWorkbook = new ExcelJS.Workbook();
    await complexWorkbook.xlsx.load(Buffer.from(complexBytes));
    const complexCalculation = complexWorkbook.getWorksheet("Расчёт")!;
    const complexComposition = complexWorkbook.getWorksheet("Состав комплекса")!;
    expect(complexCalculation.getCell("A1").value).toBe("Нормативный расчёт стоимости комплекса объектов");
    expect(complexCalculation.getCell("B19").value).toMatchObject({ formula: expect.stringContaining("ROUND(") });
    expect(complexComposition.getCell("A1").value).toBe("Ведомость нормативных позиций комплекса");
    expect(complexComposition.getCell("B7").value).toBe("ИТОГО ПО КОМПЛЕКСУ");
    expect(complexComposition.getCell("N7").value).toMatchObject({ formula: "SUM(N5:N6)" });
    expect(complexComposition.getCell("I6").value).toBe(0.5);

    const complexSnapshot: CalculationSnapshot = {
      ...snapshot,
      project: complexProject,
      result: calculateEstimate(complexProject, catalog),
    };
    const fullComplexBytes = await exportEstimateWorkbook(complexSnapshot, { fileName: "complex.xlsx", includeAuditSheets: true });
    const fullComplexWorkbook = new ExcelJS.Workbook();
    await fullComplexWorkbook.xlsx.load(Buffer.from(fullComplexBytes));
    expect(fullComplexWorkbook.getWorksheet("Комплекс ФГИС")?.getCell("B7").value).toBe("ИТОГО ПО КОМПЛЕКСУ");
  });
});
