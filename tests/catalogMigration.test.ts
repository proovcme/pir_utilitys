import { describe, expect, it } from "vitest";
import { seedCatalog } from "../src/data/seedCatalog";
import { migrateCatalogLines } from "../src/domain/catalogMigration";

describe("migrateCatalogLines", () => {
  it("updates the old PP87 numbering without losing user calculation inputs", () => {
    const oldPos = {
      ...seedCatalog.lines.find((line) => line.id === "ПП87.ОКС.7")!,
      id: "ПП87.ОКС.6",
      section: "Раздел 6",
      manualAmount: 321000,
      calculationType: "Подряд",
    };
    const migrated = migrateCatalogLines([oldPos], seedCatalog.lines, 1);
    const pos = migrated.find((line) => line.id === "ПП87.ОКС.7");

    expect(pos?.name).toBe("Проект организации строительства");
    expect(pos?.section).toBe("Раздел 7");
    expect(pos?.calculationType).toBe("Подряд");
    expect(pos?.manualAmount).toBe(321000);
    expect(migrated.some((line) => line.id === "ПП87.ОКС.13")).toBe(true);
    expect(migrated.some((line) => line.id === "ОБЩ.ГЕОДЕЗИЯ")).toBe(true);
  });
});
