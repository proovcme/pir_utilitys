import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, FileSpreadsheet, Users } from "lucide-react";
import { FgisPirCalculator } from "./components/FgisPirCalculator";
import { PirLaborCalculator, PirPassportFields, PirSummary } from "./components/PirForms707";
import { calculateSbcResult } from "./domain/calculation";
import {
  DEFAULT_PIR_LABOR_INPUT,
  DEFAULT_PIR_PASSPORT,
  type PirEstimatePassport,
  type PirLaborInput,
  type PirSummaryExtra,
} from "./domain/pirForms";
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
  sbcCalculationDate: new Date().toISOString().slice(0, 10),
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

type PirPublicMode = "1p" | "2p" | "3p";

interface PublicPirWorkspace {
  project: ProjectInput;
  passport: PirEstimatePassport;
  labor: PirLaborInput;
  summaryExtras: PirSummaryExtra[];
}

const publicWorkspaceKey = "ovc-pir-forms-v1";

function loadPublicWorkspace(): PublicPirWorkspace {
  try {
    const stored = JSON.parse(localStorage.getItem(publicWorkspaceKey) ?? "null") as Partial<PublicPirWorkspace> | null;
    return {
      project: { ...publicProjectDefaults, ...(stored?.project ?? {}) },
      passport: { ...DEFAULT_PIR_PASSPORT, ...(stored?.passport ?? {}) },
      labor: {
        ...DEFAULT_PIR_LABOR_INPUT,
        ...(stored?.labor ?? {}),
        works: stored?.labor?.works?.length ? stored.labor.works : DEFAULT_PIR_LABOR_INPUT.works,
      },
      summaryExtras: stored?.summaryExtras ?? [],
    };
  } catch {
    return { project: publicProjectDefaults, passport: DEFAULT_PIR_PASSPORT, labor: DEFAULT_PIR_LABOR_INPUT, summaryExtras: [] };
  }
}

export function PublicPirApp() {
  const initial = useMemo(loadPublicWorkspace, []);
  const [mode, setMode] = useState<PirPublicMode>("2p");
  const [project, setProject] = useState<ProjectInput>(initial.project);
  const [passport, setPassport] = useState<PirEstimatePassport>(initial.passport);
  const [labor, setLabor] = useState<PirLaborInput>(initial.labor);
  const [summaryExtras, setSummaryExtras] = useState<PirSummaryExtra[]>(initial.summaryExtras);
  const [exporting, setExporting] = useState(false);
  const patchProject = useCallback((patch: Partial<ProjectInput>) => {
    setProject((current) => ({ ...current, ...patch }));
  }, []);
  const result = useMemo(() => calculateSbcResult(project, emptyTotals), [project]);
  const draftResult = useMemo(
    () => calculateSbcResult({ ...project, sbcComplexComponents: undefined }, emptyTotals),
    [project],
  );
  useEffect(() => {
    localStorage.setItem(publicWorkspaceKey, JSON.stringify({ project, passport, labor, summaryExtras } satisfies PublicPirWorkspace));
  }, [project, passport, labor, summaryExtras]);

  const patchPassport = useCallback((patch: Partial<PirEstimatePassport>) => {
    setPassport((current) => ({ ...current, ...patch }));
  }, []);

  const export2p = useCallback(async () => {
    setExporting(true);
    try {
      const { downloadPublicPirWorkbook } = await import("./services/publicPirExcel");
      await downloadPublicPirWorkbook(project, result, passport);
    } finally {
      setExporting(false);
    }
  }, [passport, project, result]);

  const export3p = useCallback(async () => {
    setExporting(true);
    try {
      const { downloadPirLaborWorkbook } = await import("./services/pirFormsExcel");
      await downloadPirLaborWorkbook(passport, labor);
    } finally {
      setExporting(false);
    }
  }, [labor, passport]);

  const export1p = useCallback(async () => {
    setExporting(true);
    try {
      const { downloadPirSummaryWorkbook } = await import("./services/pirFormsExcel");
      await downloadPirSummaryWorkbook(
        passport,
        result,
        result.officialBreakdown?.objectName ?? project.sbcFgisObjectName ?? "Нормативный расчёт",
        labor,
        summaryExtras,
      );
    } finally {
      setExporting(false);
    }
  }, [labor, passport, project.sbcFgisObjectName, result, summaryExtras]);

  return (
    <div className="public-pir-shell">
      <header className="public-pir-header">
        <a className="public-pir-brand" href="https://les.ovc.me/">
          <strong>Л.Е.С.</strong>
          <span>Расчёт стоимости проектных работ</span>
        </a>
        <nav aria-label="Источники">
          <a href="https://fgiscs.minstroyrf.ru/frsn/pir/methods" target="_blank" rel="noreferrer">ФГИС ЦС</a>
          <a href="https://gge.ru/press-center/news/vse-piry-vo-fgis-tss/" target="_blank" rel="noreferrer">Главгосэкспертиза</a>
        </nav>
      </header>

      <main className="public-pir-main">
        <section className="pir-document-switcher" aria-label="Сметные формы">
          <div>
            <span className="fgis-kicker">КОМПЛЕКТ СМЕТ НА ПРОЕКТНЫЕ РАБОТЫ</span>
            <h1>Формы 1П, 2П и 3П</h1>
            <p>Локальные расчёты формируются в 2П и 3П, общий итог — в сводной форме 1П.</p>
          </div>
          <div className="pir-document-tabs" role="tablist">
            <button className={mode === "1p" ? "active" : ""} onClick={() => setMode("1p")}><ClipboardList size={18} /><span><b>1П</b><small>Сводная смета</small></span></button>
            <button className={mode === "2p" ? "active" : ""} onClick={() => setMode("2p")}><FileSpreadsheet size={18} /><span><b>2П</b><small>По нормативу</small></span></button>
            <button className={mode === "3p" ? "active" : ""} onClick={() => setMode("3p")}><Users size={18} /><span><b>3П</b><small>По трудозатратам</small></span></button>
          </div>
        </section>

        <PirPassportFields value={passport} onChange={patchPassport} />

        {mode === "2p" ? (
          <div className="pir-form-panel">
            <div className="pir-current-form"><span>Форма 2П</span><b>Смета на основные, дополнительные и сопутствующие проектные работы</b></div>
            <FgisPirCalculator project={project} result={result} draftResult={draftResult} onChange={patchProject} onExport={export2p} exporting={exporting} fixedNormGuid="b90117ab-5223-4a7a-89ae-a8bcbb88f689" />
          </div>
        ) : null}
        {mode === "3p" ? <PirLaborCalculator input={labor} onChange={setLabor} exporting={exporting} onExport={export3p} /> : null}
        {mode === "1p" ? <PirSummary passport={passport} form2pResult={result} form2pName={result.officialBreakdown?.objectName ?? project.sbcFgisObjectName ?? ""} laborInput={labor} extras={summaryExtras} onExtrasChange={setSummaryExtras} exporting={exporting} onExport={export1p} /> : null}
      </main>

      <footer className="public-pir-footer">
        Расчёты предназначены для обоснования стоимости проектных работ. Перед применением проверьте исходные данные и основания по официальным документам. Контакты: OVC.me.
      </footer>
    </div>
  );
}
