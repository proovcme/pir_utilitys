import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import manifestJson from "../src/data/fgisPirManifest.json";
import {
  fgisPirSnapshot,
  fgisPirBreakdownCatalog,
  fgisPirTableCatalog,
  findFgisTableRow,
  explainFgisIndicator,
  getFgisDocuments,
  getFgisPeriod,
  getFgisTableDocument,
  getFgisBreakdownDocument,
  getFgisBreakdownTable,
  interpolateFgisPercent,
  projectPatchForFgisRow,
  projectPatchForFgisDocument,
} from "../src/domain/fgisPir";

const fgisPirManifest = manifestJson as {
  catalogSha256: string;
  documentCount: number;
  totalBytes: number;
};

describe("FGIS PIR snapshot", () => {
  it("contains the current official catalog and downloaded document manifest", () => {
    const active = getFgisPeriod(fgisPirSnapshot.activePeriodId);

    expect(active.label).toBe("2 квартал 2026 г.");
    expect(active.design.documents).toHaveLength(93);
    expect(active.survey.documents).toHaveLength(14);
    expect(fgisPirSnapshot.methods.documents).toHaveLength(6);
    expect(fgisPirSnapshot.examples.documents).toHaveLength(14);
    expect(fgisPirManifest.catalogSha256).toBe(fgisPirSnapshot.catalogSha256);
    expect(fgisPirManifest.documentCount).toBe(133);
    expect(fgisPirManifest.totalBytes).toBeGreaterThan(200_000_000);
    expect(fgisPirSnapshot.download.documentCount).toBe(fgisPirManifest.documentCount);
  });

  it("keeps every active norm tied to an official index and download URL", () => {
    const active = getFgisPeriod(fgisPirSnapshot.activePeriodId);
    const documents = [
      ...getFgisDocuments(active, "design"),
      ...getFgisDocuments(active, "survey"),
    ];

    expect(documents).toHaveLength(107);
    documents.forEach((document) => {
      expect(document.priceLevel).toMatch(/^01\.01\.\d{4}$/);
      expect(document.index).toBeGreaterThan(0);
      expect(document.downloadUrl).toMatch(/^https:\/\/fgiscs\.minstroyrf\.ru\/api\//);
    });
  });

  it("applies the norm passport and period index without changing calculation inputs", () => {
    const active = getFgisPeriod(fgisPirSnapshot.activePeriodId);
    const document = active.survey.documents.find((item) => item.priceLevel === "01.01.2001")!;
    const patch = projectPatchForFgisDocument(seedCatalog.projectInput, active, "survey", document);

    expect(patch.sbcCollectionName).toBe(document.name);
    expect(patch.sbcBaseYear).toBe("01.01.2001");
    expect(patch.sbcIndexToCurrent).toBe(7.07);
    expect(patch.sbcFgisPeriodLabel).toBe("2 квартал 2026 г.");
    expect(patch.sbcConstantA).toBeUndefined();
    expect(patch.sbcNaturalIndicator).toBeUndefined();
  });

  it("exposes official natural indicators as named table rows", () => {
    const document = getFgisTableDocument("b90117ab-5223-4a7a-89ae-a8bcbb88f689")!;
    const table = document.tables.find((item) => item.code === "3.1")!;
    const row = findFgisTableRow(table, "Индивидуальный жилой дом", 120)!;

    expect(fgisPirTableCatalog.documents).toHaveLength(2);
    expect(fgisPirTableCatalog.documents.reduce((sum, item) => sum + item.rowCount, 0)).toBe(484);
    expect(document.tables).toHaveLength(17);
    expect(document.percentTables).toHaveLength(1);
    expect(table.title).toBe("Жилые объекты для постоянного проживания");
    expect(row.rangeLabel).toBe("от 100 до 150 включительно");
    expect(row.unit).toBe("кв. м.");
    expect(row.aThousandRub).toBe(51.2);
    expect(row.bThousandRubPerUnit).toBe(3.069);
  });

  it("interpolates table 3.18 and clamps values outside the published range", () => {
    const document = getFgisTableDocument("b90117ab-5223-4a7a-89ae-a8bcbb88f689")!;
    const table = document.percentTables[0];
    const middle = interpolateFgisPercent(table, 50_000_000);
    const below = interpolateFgisPercent(table, 10_000_000);
    const above = interpolateFgisPercent(table, 200_000_000_000);

    expect(table.code).toBe("3.18");
    expect(middle.lower.constructionCostMillionRub).toBeLessThan(50);
    expect(middle.upper.constructionCostMillionRub).toBeGreaterThanOrEqual(50);
    expect(middle.clamped).toBeNull();
    expect(below.clamped).toBe("min");
    expect(above.clamped).toBe("max");
  });

  it("exposes official 40/60 stages and all 20 section shares", () => {
    const document = getFgisBreakdownDocument("b90117ab-5223-4a7a-89ae-a8bcbb88f689")!;
    const table = getFgisBreakdownTable(document, "3.1")!;
    const house = table.objects.find((item) => item.id === "1")!;

    expect(fgisPirBreakdownCatalog.sections).toHaveLength(20);
    expect(document.tableCount).toBe(17);
    expect(document.objectCount).toBe(122);
    expect(document.stageShares).toEqual({ pd: 40, rd: 60, combined: 100 });
    expect(house.stages.pd.АР).toBe(21.1);
    expect(house.stages.rd.АР).toBe(25.8);
    expect(house.totals).toEqual({ pd: 100, rd: 100, combined: 100 });
  });

  it("selects another coefficient row when X crosses an official interval", () => {
    const document = getFgisTableDocument("b90117ab-5223-4a7a-89ae-a8bcbb88f689")!;
    const table = document.tables.find((item) => item.code === "3.1")!;
    const objectName = "Крупнопанельный многоквартирный дом (многоэтажный, среднеэтажный)";
    const row = findFgisTableRow(table, objectName, 16_000)!;
    const patch = projectPatchForFgisRow(table, row, 16_000);

    expect(row.rangeLabel).toBe("от 15 000 до 20 000 включительно");
    expect(patch.sbcConstantA).toBe(6_700_700);
    expect(patch.sbcConstantB).toBe(419);
    expect(patch.sbcFgisTablePage).toBe(8);
    expect(findFgisTableRow(table, "Индивидуальный жилой дом", 200)).toBeUndefined();
  });

  it("explains every structured natural indicator in business terms", () => {
    expect(explainFgisIndicator("кв. м.", "Индивидуальный жилой дом")).toMatchObject({
      label: "Общая площадь объекта",
    });
    expect(explainFgisIndicator("м", "Горнолыжная трасса")).toMatchObject({
      label: "Протяжённость трассы",
    });
    expect(explainFgisIndicator("шт.", "Сооружение стрельбища с количеством огневых позиций")).toMatchObject({
      label: "Количество огневых позиций",
    });
    expect(explainFgisIndicator("посадочное место", "Здание кафе")).toMatchObject({
      label: "Количество посадочных мест",
    });
  });
});
