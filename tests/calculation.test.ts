import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import { calculateEstimate, seedToCatalog } from "../src/domain/calculation";

describe("calculateEstimate", () => {
  it("matches the source workbook totals with default computer depreciation", () => {
    const result = calculateEstimate(seedCatalog.projectInput, seedToCatalog(seedCatalog));

    expect(result.totals.activeRows).toBe(15);
    expect(result.totals.directWorks).toBe(3_970_541.64);
    expect(result.totals.bufferAmount).toBe(119_116.25);
    expect(result.totals.totalWithoutVat).toBe(4_089_657.89);
    expect(result.totals.vatAmount).toBe(899_724.74);
    expect(result.totals.totalWithVat).toBe(4_989_382.62);
  });

  it("lets manual include activate a line outside presets", () => {
    const catalog = seedToCatalog(seedCatalog);
    const target = catalog.lines.find((line) => !line.presetRdCore && line.calculationType === "ФОТ");
    expect(target).toBeDefined();

    const baseline = calculateEstimate(seedCatalog.projectInput, catalog);
    const changed = calculateEstimate(seedCatalog.projectInput, {
      ...catalog,
      lines: catalog.lines.map((line) =>
        line.id === target!.id ? { ...line, manualInclude: true, excluded: false } : line,
      ),
    });

    expect(changed.totals.activeRows).toBe(baseline.totals.activeRows + 1);
    expect(changed.activeLines.some((line) => line.id === target!.id)).toBe(true);
  });

  it("lets exclusion override preset and manual include", () => {
    const catalog = seedToCatalog(seedCatalog);
    const target = calculateEstimate(seedCatalog.projectInput, catalog).activeLines[0];
    const changed = calculateEstimate(seedCatalog.projectInput, {
      ...catalog,
      lines: catalog.lines.map((line) =>
        line.id === target.id ? { ...line, manualInclude: true, excluded: true } : line,
      ),
    });

    expect(changed.activeLines.some((line) => line.id === target.id)).toBe(false);
  });

  it("calculates manual sums instead of FOT estimates", () => {
    const catalog = seedToCatalog(seedCatalog);
    const manualLine = {
      ...catalog.lines[0],
      id: "TEST.MANUAL",
      source: "Ручная",
      calculationType: "Ручная сумма",
      manualInclude: true,
      excluded: false,
      manualAmount: 123456,
      presetPdOks: false,
      presetPdLinear: false,
      presetRdCore: false,
      presetRdFull: false,
      presetRdFrequent: false,
      common: false,
    };

    const result = calculateEstimate(seedCatalog.projectInput, {
      ...catalog,
      lines: [manualLine],
    });

    expect(result.totals.directWorks).toBe(123456);
  });

  it("reports missing rate warnings for active FOT lines", () => {
    const catalog = seedToCatalog(seedCatalog);
    const target = catalog.lines.find((line) => line.calculationType === "ФОТ");
    const result = calculateEstimate(seedCatalog.projectInput, {
      ...catalog,
      lines: [
        {
          ...target!,
          id: "TEST.NO_RATE",
          departmentCode: "NOPE",
          manualInclude: true,
          excluded: false,
          presetPdOks: false,
          presetPdLinear: false,
          presetRdCore: false,
          presetRdFull: false,
          presetRdFrequent: false,
          common: false,
        },
      ],
    });

    expect(result.totals.warningCount).toBe(1);
    expect(result.warnings[0]).toContain("Нет ставки");
  });
});
