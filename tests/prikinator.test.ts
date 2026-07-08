import { describe, expect, it } from "vitest";
import {
  calculatePrikinatorBuild,
  linesForObject,
  ncsPriceForCapacity,
  prikinatorRegions,
  prikinatorWorks,
} from "../src/domain/prikinator";

describe("prikinator NCS calculation", () => {
  it("uses a selected NCS row as a visible source of the unit price", () => {
    const line = linesForObject("office").find((item) => item.code === "02-01-001-03")!;
    const result = calculatePrikinatorBuild({
      line,
      capacity: 4500,
      work: prikinatorWorks[0],
      region: prikinatorRegions[0],
      vatRate: 0.22,
    });

    expect(result.unitPriceRub).toBe(107450);
    expect(result.baseCost).toBe(483_525_000);
    expect(result.totalWithVat).toBe(589_900_500);
    expect(result.ncs.note).toContain("02-01-001-03");
  });

  it("interpolates between rows of the same NCS table and unit", () => {
    const line = linesForObject("office").find((item) => item.code === "02-01-001-03")!;
    const result = ncsPriceForCapacity(line, 9000);

    expect(result.method).toBe("interpolation");
    expect(result.lower?.code).toBe("02-01-001-03");
    expect(result.upper?.code).toBe("02-01-001-04");
    expect(result.priceThousandRub).toBeCloseTo(103.75, 2);
  });
});
