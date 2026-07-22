import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import { calculateEstimate, getRateGroupCode, seedToCatalog } from "../src/domain/calculation";

describe("calculateEstimate", () => {
  it("matches the source workbook totals with default computer depreciation", () => {
    const result = calculateEstimate(seedCatalog.projectInput, seedToCatalog(seedCatalog));

    expect(result.totals.activeRows).toBe(18);
    expect(result.totals.directWorks).toBe(3_743_888.16);
    expect(result.totals.bufferAmount).toBe(112_316.64);
    expect(result.totals.totalWithoutVat).toBe(3_856_204.8);
    expect(result.totals.vatAmount).toBe(848_365.06);
    expect(result.totals.totalWithVat).toBe(4_704_569.86);
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

  it("calculates any subcontracted section from the entered contract amount", () => {
    const catalog = seedToCatalog(seedCatalog);
    const subcontractedLine = {
      ...catalog.lines.find((line) => line.id === "ПП87.ОКС.8")!,
      calculationType: "Подряд",
      manualInclude: true,
      excluded: false,
      manualAmount: 987654.32,
      presetPdOks: false,
    };

    const result = calculateEstimate(seedCatalog.projectInput, {
      ...catalog,
      lines: [subcontractedLine],
    });

    expect(result.activeLines[0].calculationType).toBe("Подряд");
    expect(result.totals.directWorks).toBe(987654.32);
    expect(result.totals.warningCount).toBe(0);
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

  it("pays remaining cash flow by PD and RD acceptance stages", () => {
    const catalog = seedToCatalog(seedCatalog);
    const project = {
      ...seedCatalog.projectInput,
      includeCommon: false,
      presetPdOks: true,
      presetRdCore: true,
      workStartMonth: "2026-07",
      workEndMonth: "2026-10",
      advanceRate: 0.3,
    };
    const result = calculateEstimate(project, catalog);

    expect(result.finance.cashFlow).toHaveLength(4);
    expect(result.groupBreakdown.some((group) => group.group === "ПД")).toBe(true);
    expect(result.groupBreakdown.some((group) => group.group === "РД")).toBe(true);
    expect(result.finance.cashFlow[0].revenue).toBe(result.finance.advanceAmount);
    expect(result.finance.cashFlow[1].revenue).toBeGreaterThan(0);
    expect(result.finance.cashFlow[3].revenue).toBeGreaterThan(0);
  });

  it("pays all remaining cash flow at the end when only one stage is active", () => {
    const catalog = seedToCatalog(seedCatalog);
    const project = {
      ...seedCatalog.projectInput,
      includeCommon: false,
      presetPdOks: true,
      presetRdCore: false,
      workStartMonth: "2026-07",
      workEndMonth: "2026-09",
      advanceRate: 0.3,
    };
    const result = calculateEstimate(project, catalog);

    expect(result.finance.cashFlow).toHaveLength(3);
    expect(result.finance.cashFlow[0].revenue).toBe(result.finance.advanceAmount);
    expect(result.finance.cashFlow[1].revenue).toBe(0);
    expect(result.finance.cashFlow[2].revenue).toBe(result.finance.remainingAmount);
  });

  it("calculates configurable SBC baseline and compares it with the estimate", () => {
    const result = calculateEstimate(seedCatalog.projectInput, seedToCatalog(seedCatalog));

    expect(result.sbc.method).toBe("natural");
    expect(result.sbc.basePrice).toBe(4_300_000);
    expect(result.sbc.currentPriceWithoutVat).toBe(4_300_000);
    expect(result.sbc.currentPriceWithVat).toBe(5_246_000);
    expect(result.sbc.normativeDurationDays).toBe(90);
    expect(result.sbc.differenceWithoutVat).toBe(-443_795.2);
  });

  it("contains the expanded RD engineering marks and maps them to rate groups", () => {
    const expectedMarks = [
      "ЭФ", "ЭН", "ЭОМ", "ЭС", "ЭГ", "АСКУЭ", "ЗМ", "ВК", "ВПВ", "НВ", "АСКУВ", "НК",
      "НКЛ", "ДР", "ЛОС", "ОВ", "ОВ.ДУ", "ХС", "ИТП", "ТС", "АСКУТ", "АОВ", "АИТП",
      "АВК", "ДИСП", "BMS", "СС", "СКС", "ЛВС", "Wi-Fi", "ТФ", "ТВ", "РТ", "ЧФ",
      "НСС", "СКУД", "СОТ", "ОС", "ПС", "СОУЭ", "АУПТ", "ВП", "ПРК", "ЭЗС", "ЛФ", "АДУ",
    ];
    const referenceByMark = new Map(seedCatalog.rdReference.map((item) => [item.mark, item]));

    expectedMarks.forEach((mark) => {
      const reference = referenceByMark.get(mark);
      expect(reference, `Нет марки ${mark} в базе РД`).toBeDefined();
      expect(getRateGroupCode(reference?.departmentCode), `Нет группы ставок для ${mark}`).toBeTruthy();
    });
  });

  it("contains the current PP87 OKS sections and requested general work", () => {
    const oksSections = seedCatalog.pp87Reference
      .filter((item) => item.type === "ОКС" && !String(item.number).includes("."))
      .map((item) => String(item.number));
    expect(oksSections).toEqual(Array.from({ length: 13 }, (_, index) => String(index + 1)));
    expect(seedCatalog.lines.find((line) => line.id === "ПП87.ОКС.8")?.departmentCode).toBe("ООС");
    expect(seedCatalog.lines.find((line) => line.id === "ДОП.ПД.АКУСТИКА")?.calculationType).toBe("Подряд");
    ["ОБЩ.ОБСЛЕДОВАНИЕ", "ОБЩ.СКАНИРОВАНИЕ", "ОБЩ.ГЕОДЕЗИЯ"].forEach((id) => {
      const line = seedCatalog.lines.find((item) => item.id === id);
      expect(line, `Нет общей работы ${id}`).toBeDefined();
      expect(line?.calculationType).toBe("Подряд");
    });
  });
});
