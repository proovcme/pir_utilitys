import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import { calculateEstimate, seedToCatalog } from "../src/domain/calculation";
import { exportEstimateWorkbook } from "../src/services/excelExport";
import type { CalculationSnapshot } from "../src/domain/types";

describe("exportEstimateWorkbook", () => {
  it("creates a valid workbook with formulas", async () => {
    const catalog = seedToCatalog(seedCatalog);
    const snapshot: CalculationSnapshot = {
      id: "test",
      name: "Тестовая оценка",
      project: seedCatalog.projectInput,
      catalog,
      result: calculateEstimate(seedCatalog.projectInput, catalog),
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

    const control = workbook.getWorksheet("Пульт")!;
    const summary = workbook.getWorksheet("Итог")!;
    const estimate = workbook.getWorksheet("Оценка")!;
    const constructor = workbook.getWorksheet("Конструктор")!;
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
  });
});
