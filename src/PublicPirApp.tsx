import { useCallback, useMemo, useState } from "react";
import { FgisPirCalculator } from "./components/FgisPirCalculator";
import { calculateSbcResult } from "./domain/calculation";
import type { EstimateTotals, ProjectInput } from "./domain/types";

const publicProjectDefaults: ProjectInput = {
  area: 0,
  vatRate: 0.22,
  commercialCoefficient: 1,
  overheadRate: 0,
  bufferRate: 0,
  advanceRate: 0,
  workStartMonth: "",
  workEndMonth: "",
  bankGuaranteeAnnualRate: 0,
  sbcMethod: "natural",
  sbcCollectionName: "",
  sbcBaseYear: "",
  sbcNaturalIndicator: 0,
  sbcConstantA: 0,
  sbcConstantB: 0,
  sbcConstructionCost: 0,
  sbcDesignPercent: 0.04,
  sbcIndexToCurrent: 1,
  sbcComplexityCoefficient: 1,
  sbcAdjustmentCoefficient: 1,
  sbcPdShare: 0.4,
  sbcRdShare: 0.6,
  sbcBaseDurationDays: 0,
  sbcDurationCoefficient: 1,
  sbcFgisKind: "design",
  sbcFgisNormGuid: "",
  sbcFgisPeriodId: 426,
  sbcFgisPeriodLabel: "2 квартал 2026 г.",
  sbcFgisApprovingAct: "",
  sbcFgisSourceUrl: "",
  sbcFgisCatalogSha256: "",
  rateMultiplier: 0,
  roleStepRate: 0,
  useGlobalCoefficient: false,
  globalCoefficient: 1,
  useGlobalDuration: false,
  globalDurationDays: 0,
  computerCost: 0,
  computerSalvageValue: 0,
  computerUsefulLifeYears: 0,
  insuranceContributionRate: 0,
  includeCommon: false,
  presetPdOks: false,
  presetPdLinear: false,
  presetRdFull: false,
  presetRdCore: false,
  presetRdFrequent: false,
};

const emptyTotals: EstimateTotals = {
  directWorks: 0,
  bufferAmount: 0,
  totalWithBuffer: 0,
  overheadAmount: 0,
  totalWithOverhead: 0,
  commercialMarkup: 0,
  totalWithoutVat: 0,
  vatAmount: 0,
  totalWithVat: 0,
  costWithoutVatPerSquareMeter: 0,
  costWithVatPerSquareMeter: 0,
  activeRows: 0,
  warningCount: 0,
  personDays: 0,
};

export function PublicPirApp() {
  const [project, setProject] = useState<ProjectInput>(publicProjectDefaults);
  const [exporting, setExporting] = useState(false);
  const patchProject = useCallback((patch: Partial<ProjectInput>) => {
    setProject((current) => ({ ...current, ...patch }));
  }, []);
  const result = useMemo(() => calculateSbcResult(project, emptyTotals), [project]);
  const exportXlsx = useCallback(async () => {
    setExporting(true);
    try {
      const { downloadPublicPirWorkbook } = await import("./services/publicPirExcel");
      await downloadPublicPirWorkbook(project, result);
    } finally {
      setExporting(false);
    }
  }, [project, result]);

  return (
    <div className="public-pir-shell">
      <header className="public-pir-header">
        <a className="public-pir-brand" href="https://les.ovc.me/">
          <strong>Л.Е.С.</strong>
          <span>Публичный калькулятор ПИР</span>
        </a>
        <nav aria-label="Источники">
          <a href="https://fgiscs.minstroyrf.ru/frsn/pir/methods" target="_blank" rel="noreferrer">ФГИС ЦС</a>
          <a href="https://gge.ru/press-center/news/vse-piry-vo-fgis-tss/" target="_blank" rel="noreferrer">Главгосэкспертиза</a>
        </nav>
      </header>

      <main className="public-pir-main">
        <FgisPirCalculator project={project} result={result} onChange={patchProject} onExport={exportXlsx} exporting={exporting} />
      </main>

      <footer className="public-pir-footer">
        Расчёт справочный. Перед применением проверьте таблицу, область действия норматива и коэффициенты в официальном документе.
      </footer>
    </div>
  );
}
