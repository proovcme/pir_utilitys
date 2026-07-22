import type { EstimateLine } from "./types";

const legacyPp87OksIds: Record<string, string> = {
  "ПП87.ОКС.5.7": "ПП87.ОКС.6",
  "ПП87.ОКС.6": "ПП87.ОКС.7",
  "ПП87.ОКС.7": "ПП87.ОКС.8",
  "ПП87.ОКС.8": "ПП87.ОКС.9",
  "ПП87.ОКС.9": "ПП87.ОКС.10",
  "ПП87.ОКС.10": "ПП87.ОКС.12",
};

const requiredSystemLine = (line: EstimateLine) =>
  line.id.startsWith("ПП87.ОКС.") ||
  line.id === "ДОП.ПД.АКУСТИКА" ||
  line.id === "ОБЩ.ОБСЛЕДОВАНИЕ" ||
  line.id === "ОБЩ.СКАНИРОВАНИЕ" ||
  line.id === "ОБЩ.ГЕОДЕЗИЯ";

export function migrateCatalogLines(
  currentLines: EstimateLine[],
  seedLines: EstimateLine[],
  currentVersion: number,
): EstimateLine[] {
  const canonicalById = new Map(
    seedLines.filter(requiredSystemLine).map((line) => [line.id, line]),
  );
  const migrated = currentLines.map((line) => {
    const id = currentVersion < 2 ? legacyPp87OksIds[line.id] ?? line.id : line.id;
    const current = { ...line, id };
    const canonical = canonicalById.get(id);
    if (!canonical) return current;
    return {
      ...canonical,
      ...current,
      id: canonical.id,
      source: canonical.source,
      costGroup: canonical.costGroup ?? current.costGroup,
      category: canonical.category,
      section: canonical.section,
      name: canonical.name,
    };
  });
  const existingIds = new Set(migrated.map((line) => line.id));
  seedLines.filter(requiredSystemLine).forEach((line) => {
    if (!existingIds.has(line.id)) {
      migrated.push(line);
      existingIds.add(line.id);
    }
  });
  return migrated;
}
