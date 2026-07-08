import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Calculator,
  Download,
  FileClock,
  FileSpreadsheet,
  FolderOpen,
  History,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { seedCatalog } from "./data/seedCatalog";
import {
  calculateEstimate,
  calculateMonthlyDepreciation,
  getLineStaffing,
  getRateGroupCode,
  getStaffRoleMultiplier,
  normalizeCalculationType,
  normalizeStaffRole,
  rateDisciplineDefinitions,
  resolveCostGroup,
  seedToCatalog,
} from "./domain/calculation";
import type {
  CalculationSnapshot,
  Catalog,
  EstimateLine,
  EstimateTemplate,
  ProjectInput,
  RateGroup,
} from "./domain/types";
import { exportEstimateWorkbook, saveEstimateWorkbook } from "./services/excelExport";
import { exportRatesCsv, exportRatesXlsx, importRatesFile } from "./services/rateExchange";
import { createStorageService } from "./services/storage";

type View = "summary" | "estimate" | "configuration" | "rates" | "sbc" | "templates" | "history";
type EstimateFilters = {
  id: string;
  section: string;
  group: string;
  name: string;
  code: string;
  type: string;
  workUnits: string;
  duration: string;
  manualAmount: string;
  coefficient: string;
  cost: string;
  comment: string;
};
type SortDirection = "asc" | "desc";
type EstimateColumnKey = keyof EstimateFilters;
type SortState = {
  key: EstimateColumnKey;
  direction: SortDirection;
} | null;

const storage = createStorageService();
const defaultCostGroups = ["ПД", "РД", "Общие", "АГО", "ТЭО", "Прочее"];
const hiddenRateCodes = new Set(["КОМАНД", "ПЕЧАТЬ", "АМОРТ"]);

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const compactCurrency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });
const formatPercent = (value: number | undefined) => percent.format(Number.isFinite(value) ? value ?? 0 : 0);

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const defaultProjectInput: ProjectInput = seedCatalog.projectInput;

const normalizeProject = (project: ProjectInput): ProjectInput => {
  const normalized = { ...defaultProjectInput, ...project };
  for (const key of Object.keys(defaultProjectInput) as Array<keyof ProjectInput>) {
    if (normalized[key] === undefined || normalized[key] === null || Number.isNaN(normalized[key])) {
      normalized[key] = defaultProjectInput[key] as never;
    }
  }
  return normalized;
};
const getDefaultStageDuration = (stage: string, lines: EstimateLine[]) => {
  const durations = lines
    .filter((line) => resolveCostGroup(line) === stage && line.calculationType !== "Заголовок" && line.durationDays > 0)
    .map((line) => line.durationDays);
  if (!durations.length) return stage === "РД" ? 60 : 30;
  const counts = new Map<number, number>();
  durations.forEach((duration) => counts.set(duration, (counts.get(duration) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
};
const normalizeCatalog = (catalog: Catalog): Catalog => {
  const seed = seedToCatalog(seedCatalog);
  const rateMap = new Map(catalog.rates.map((rate) => [rate.code, rate]));
  seed.rates.forEach((seedRate) => {
    const currentRate = rateMap.get(seedRate.code);
    if (!currentRate) {
      rateMap.set(seedRate.code, seedRate);
      return;
    }
    if (!Number.isFinite(currentRate.monthlySalaryMedian)) {
      rateMap.set(seedRate.code, { ...currentRate, monthlySalaryMedian: seedRate.monthlySalaryMedian });
    }
  });

  return {
    ...seed,
    ...catalog,
    rates: Array.from(rateMap.values()),
    rdReference: catalog.rdReference?.length ? catalog.rdReference : seed.rdReference,
    pp87Reference: catalog.pp87Reference?.length ? catalog.pp87Reference : seed.pp87Reference,
    presetSets: catalog.presetSets?.length ? catalog.presetSets : seed.presetSets,
    lines: catalog.lines.map((line) => {
      const isPp87Section5Header =
        line.section === "Раздел 5" &&
        String(line.name ?? "").startsWith("Сведения об инженерном оборудовании");
      return {
        ...line,
        costGroup: line.costGroup ?? resolveCostGroup(line),
        calculationType: isPp87Section5Header ? "Заголовок" : normalizeCalculationType(line.calculationType),
        staffRole: normalizeStaffRole(line.staffRole),
        departmentCode: getRateGroupCode(line.departmentCode),
        chiefUnits: isPp87Section5Header ? 0 : line.chiefUnits,
        leadUnits: isPp87Section5Header ? 0 : line.leadUnits,
        engineerUnits: isPp87Section5Header ? 0 : line.engineerUnits,
        workUnits: isPp87Section5Header ? 0 : line.workUnits,
        durationDays: isPp87Section5Header ? 0 : line.durationDays,
        manualAmount: isPp87Section5Header ? 0 : line.manualAmount,
      };
    }),
  };
};
const emptyEstimateFilters: EstimateFilters = {
  id: "",
  section: "",
  group: "",
  name: "",
  code: "",
  type: "",
  workUnits: "",
  duration: "",
  manualAmount: "",
  coefficient: "",
  cost: "",
  comment: "",
};
const isManualOrPercentLine = (line: EstimateLine) =>
  line.calculationType === "Ручной" ||
  line.calculationType === "Ручная сумма" ||
  line.calculationType === "% от общего";

function makeSnapshot(name: string, project: ProjectInput, catalog: Catalog): CalculationSnapshot {
  const result = calculateEstimate(project, catalog);
  return {
    id: id(),
    name,
    project,
    catalog,
    result,
    createdAt: now(),
  };
}

function NumericInput({
  value,
  step = 1,
  min,
  disabled,
  onChange,
}: {
  value: number;
  step?: number | string;
  min?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(Number.isFinite(value) ? String(value) : "");

  useEffect(() => {
    setDraft(Number.isFinite(value) ? String(value) : "");
  }, [value]);

  function commit(nextDraft: string) {
    const normalized = nextDraft.replace(",", ".");
    if (normalized === "" || normalized === "-" || normalized === ".") return;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) onChange(parsed);
  }

  return (
    <input
      type="number"
      min={min}
      step={step}
      disabled={disabled}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        commit(event.target.value);
      }}
      onBlur={() => {
        if (draft === "" || draft === "-" || draft === ".") {
          setDraft("0");
          onChange(0);
        }
      }}
    />
  );
}

function NumberField({
  label,
  value,
  step = 1,
  min,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-affix">
        <NumericInput value={value} min={min} step={step} onChange={onChange} />
        {suffix ? <b>{suffix}</b> : null}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MonthField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="month" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function StaffingCell({
  chief,
  lead,
  engineer,
  onChange,
}: {
  chief: number;
  lead: number;
  engineer: number;
  onChange: (patch: { chiefUnits?: number; leadUnits?: number; engineerUnits?: number }) => void;
}) {
  return (
    <div className="staffing-cell">
      <label>
        <span>Гл</span>
        <NumericInput value={chief} min={0} step={0.25} onChange={(value) => onChange({ chiefUnits: value })} />
      </label>
      <label>
        <span>Вед</span>
        <NumericInput value={lead} min={0} step={0.25} onChange={(value) => onChange({ leadUnits: value })} />
      </label>
      <label>
        <span>Инж</span>
        <NumericInput value={engineer} min={0} step={0.25} onChange={(value) => onChange({ engineerUnits: value })} />
      </label>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "accent" | "warn" }) {
  return (
    <section className={`stat ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

export function App() {
  const [view, setView] = useState<View>("summary");
  const [project, setProject] = useState<ProjectInput>(normalizeProject(seedCatalog.projectInput));
  const [catalog, setCatalog] = useState<Catalog>(() => normalizeCatalog(seedToCatalog(seedCatalog)));
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("Все");
  const [templates, setTemplates] = useState<EstimateTemplate[]>([]);
  const [historyItems, setHistoryItems] = useState<CalculationSnapshot[]>([]);
  const [notice, setNotice] = useState("Готово");
  const [showSbcComparison, setShowSbcComparison] = useState(false);
  const [estimateFilters, setEstimateFilters] = useState<EstimateFilters>(emptyEstimateFilters);
  const [sortState, setSortState] = useState<SortState>(null);
  const [openHeaderMenu, setOpenHeaderMenu] = useState<EstimateColumnKey | null>(null);
  const [rdPickerOpen, setRdPickerOpen] = useState(false);
  const [rdQuery, setRdQuery] = useState("");
  const [selectedRdMarks, setSelectedRdMarks] = useState<string[]>([]);
  const [selectedConfigLineIds, setSelectedConfigLineIds] = useState<string[]>([]);
  const [presetDraftName, setPresetDraftName] = useState("Гостиницы");
  const [openCommentLineIds, setOpenCommentLineIds] = useState<string[]>([]);

  const result = useMemo(() => calculateEstimate(project, catalog), [project, catalog]);
  const monthlyDepreciation = useMemo(() => calculateMonthlyDepreciation(project), [project]);
  const costGroups = useMemo(() => {
    const values = catalog.lines.map(resolveCostGroup);
    return Array.from(new Set([...defaultCostGroups, ...values]));
  }, [catalog.lines]);
  const customRateDefinitions = useMemo(() => {
    const knownCodes = new Set(
      rateDisciplineDefinitions.flatMap((group) => [group.code, ...group.codes]),
    );
    return catalog.rates
      .filter((rate) => !knownCodes.has(rate.code) && !hiddenRateCodes.has(rate.code))
      .map((rate) => ({
        code: rate.code,
        title: rate.code,
        description: rate.group || "Пользовательская группа",
        codes: [rate.code],
        custom: true,
      }));
  }, [catalog.rates]);
  const rateDefinitions = useMemo(
    () => [...rateDisciplineDefinitions, ...customRateDefinitions],
    [customRateDefinitions],
  );
  const rateGroupOptions = useMemo(() => rateDefinitions.map((group) => group.code), [rateDefinitions]);
  const visibleLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = result.lines.filter((line) => {
      const estimateVisible =
        view !== "estimate" ||
        line.active ||
        result.lines.some((child) => child.id.startsWith(`${line.id}.`) && child.active);
      const sourceOk = view !== "configuration" || sourceFilter === "Все" || resolveCostGroup(line) === sourceFilter;
      const queryOk =
        !q ||
        [line.id, line.source, line.category, line.section, line.name, getRateGroupCode(line.departmentCode), line.comment]
          .filter(Boolean)
          .some((part) => String(part).toLowerCase().includes(q));
      const filtersOk =
        (view !== "estimate" || !estimateFilters.id || line.id.toLowerCase().includes(estimateFilters.id.toLowerCase())) &&
        (view !== "estimate" || !estimateFilters.section || String(line.section ?? "").toLowerCase().includes(estimateFilters.section.toLowerCase())) &&
        (view !== "estimate" || !estimateFilters.group || resolveCostGroup(line).toLowerCase().includes(estimateFilters.group.toLowerCase())) &&
        (view !== "estimate" || !estimateFilters.name || String(line.name ?? "").toLowerCase().includes(estimateFilters.name.toLowerCase())) &&
        (view !== "estimate" || !estimateFilters.code || String(getRateGroupCode(line.departmentCode) ?? "").toLowerCase().includes(estimateFilters.code.toLowerCase())) &&
        (view !== "estimate" || !estimateFilters.type || String(line.calculationType ?? "").toLowerCase().includes(estimateFilters.type.toLowerCase())) &&
        (view !== "estimate" || !estimateFilters.workUnits || String(line.workUnits).includes(estimateFilters.workUnits)) &&
        (view !== "estimate" || !estimateFilters.duration || String(line.durationDays).includes(estimateFilters.duration)) &&
        (view !== "estimate" || !estimateFilters.manualAmount || String(line.manualAmount).includes(estimateFilters.manualAmount)) &&
        (view !== "estimate" || !estimateFilters.coefficient || String(line.coefficient).includes(estimateFilters.coefficient)) &&
        (view !== "estimate" || !estimateFilters.cost || String(line.workCost).includes(estimateFilters.cost)) &&
        (view !== "estimate" || !estimateFilters.comment || String(line.comment ?? "").toLowerCase().includes(estimateFilters.comment.toLowerCase()));
      return estimateVisible && sourceOk && queryOk && filtersOk;
    });
    if (!sortState || view !== "estimate") return filtered;

    const getValue = (line: (typeof filtered)[number]) => {
      switch (sortState.key) {
        case "id":
          return line.id;
        case "section":
          return line.section ?? "";
        case "group":
          return resolveCostGroup(line);
        case "name":
          return line.name ?? "";
        case "code":
          return getRateGroupCode(line.departmentCode) ?? "";
        case "type":
          return line.calculationType ?? "";
        case "workUnits":
          return line.workUnits;
        case "duration":
          return line.durationDays;
        case "manualAmount":
          return line.manualAmount;
        case "coefficient":
          return line.coefficient;
        case "cost":
          return line.workCost;
        case "comment":
          return line.comment ?? "";
        default:
          return "";
      }
    };

    return [...filtered].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      const direction = sortState.direction === "asc" ? 1 : -1;
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right), "ru", { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [estimateFilters, query, result.lines, sortState, sourceFilter, view]);
  const maxVisibleCost = useMemo(
    () => Math.max(1, ...visibleLines.map((line) => line.workCost)),
    [visibleLines],
  );
  const groupedVisibleStages = useMemo(() => {
    const visibleDirectWorks = visibleLines.reduce((sum, line) => sum + line.workCost, 0);
    const groups = new Map<string, typeof visibleLines>();
    costGroups.forEach((group) => groups.set(group, []));
    visibleLines.forEach((line) => {
      const group = resolveCostGroup(line);
      groups.set(group, [...(groups.get(group) ?? []), line]);
    });
    return Array.from(groups.entries())
      .filter(([, lines]) => lines.length > 0)
      .map(([group, lines]) => {
        const directWorks = lines.reduce((sum, line) => sum + line.workCost, 0);
        return {
          group,
          lines,
          directWorks,
          costPerSquareMeter: project.area > 0 ? directWorks / project.area : 0,
          share: visibleDirectWorks > 0 ? directWorks / visibleDirectWorks : 0,
        };
      });
  }, [costGroups, project.area, visibleLines]);
  const activeStageOverview = useMemo(() => {
    const groups = new Map<string, { rows: number; duration: number }>();
    result.lines.forEach((line) => {
      if (!line.active) return;
      const group = resolveCostGroup(line);
      const current = groups.get(group) ?? {
        rows: 0,
        duration: project.stageDurations?.[group] ?? getDefaultStageDuration(group, catalog.lines),
      };
      groups.set(group, { ...current, rows: current.rows + 1 });
    });
    return Array.from(groups.entries()).map(([group, data]) => ({ group, ...data }));
  }, [catalog.lines, project.stageDurations, result.lines]);
  const rdPickerItems = useMemo(() => {
    const q = rdQuery.trim().toLowerCase();
    return catalog.rdReference.filter((item) =>
      !q || [item.mark, item.name, item.departmentCode].filter(Boolean).some((part) => String(part).toLowerCase().includes(q)),
    );
  }, [catalog.rdReference, rdQuery]);
  const rateDisciplineSummary = useMemo(() => {
    const ratesByCode = new Map(catalog.rates.map((rate) => [rate.code, rate]));
    return rateDefinitions.map((definition) => {
      const rates = definition.codes
        .map((code) => ratesByCode.get(code))
        .filter((rate): rate is RateGroup => rate !== undefined && rate.monthlySalaryMedian > 0);
      const average = rates.length
        ? rates.reduce((sum, rate) => sum + rate.monthlySalaryMedian, 0) / rates.length
        : 0;
      const savedGroup = definition.codes.map((code) => ratesByCode.get(code)?.group).find(Boolean);
      return {
        ...definition,
        description: savedGroup ?? definition.description,
        average,
        count: rates.length,
        engineer: average * getStaffRoleMultiplier("Инженер", project.roleStepRate),
        lead: average,
        chief: average * getStaffRoleMultiplier("Главспец", project.roleStepRate),
      };
    });
  }, [catalog.rates, project.roleStepRate, rateDefinitions]);

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    const workingState = await storage.getWorkingState();
    if (workingState) {
      setProject(normalizeProject(workingState.project));
      setCatalog(normalizeCatalog(workingState.catalog));
      setNotice(`Загружена конфигурация из БД: ${new Date(workingState.updatedAt).toLocaleString("ru-RU")}`);
    }
    await refreshSavedData();
  }

  async function refreshSavedData() {
    setTemplates(await storage.listTemplates());
    setHistoryItems(await storage.listHistory());
  }

  async function saveWorkingStateToDb() {
    await storage.saveWorkingState({
      id: "current",
      project,
      catalog,
      updatedAt: now(),
    });
    setNotice("Ставки, множитель и конфигурация сохранены в БД");
  }

  function updateProject<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setProject((current) => ({ ...current, [key]: value }));
  }

  function updateStageDuration(stage: string, value: number) {
    setProject((current) => ({
      ...current,
      stageDurations: {
        ...(current.stageDurations ?? {}),
        [stage]: value,
      },
    }));
    setCatalog((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        resolveCostGroup(line) === stage && line.calculationType !== "Заголовок"
          ? { ...line, durationDays: value }
          : line,
      ),
    }));
  }

  function updateLine(idValue: string, patch: Partial<EstimateLine>) {
    setCatalog((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === idValue ? { ...line, ...patch } : line)),
    }));
  }

  function updateLineStaffing(idValue: string, patch: { chiefUnits?: number; leadUnits?: number; engineerUnits?: number }) {
    setCatalog((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.id !== idValue) return line;
        const staffing = getLineStaffing(line);
        const chiefUnits = patch.chiefUnits ?? staffing.chief;
        const leadUnits = patch.leadUnits ?? staffing.lead;
        const engineerUnits = patch.engineerUnits ?? staffing.engineer;
        return {
          ...line,
          chiefUnits,
          leadUnits,
          engineerUnits,
          workUnits: chiefUnits + leadUnits + engineerUnits,
        };
      }),
    }));
  }

  function deleteLine(idValue: string) {
    setCatalog((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== idValue),
    }));
  }

  function toggleConfigLine(idValue: string, checked: boolean) {
    setSelectedConfigLineIds((current) =>
      checked ? Array.from(new Set([...current, idValue])) : current.filter((id) => id !== idValue),
    );
  }

  function createPresetFromSelected() {
    if (!selectedConfigLineIds.length) {
      setNotice("Выберите строки в конфигурации для набора");
      return;
    }
    const name = presetDraftName.trim();
    if (!name) return;
    setCatalog((current) => ({
      ...current,
      presetSets: [
        ...current.presetSets.filter((set) => set.name !== name),
        {
          name,
          controlCell: null,
          description: `Пользовательский набор: ${selectedConfigLineIds.length} строк`,
          exclusionHint: "Настраивается в GUI",
          lineIds: selectedConfigLineIds,
        },
      ],
    }));
    setSelectedConfigLineIds([]);
    setPresetDraftName("");
    setNotice(`Набор сохранен: ${name}`);
  }

  function toggleVisibleConfigLines(checked: boolean) {
    const visibleIds = visibleLines.map((line) => line.id);
    setSelectedConfigLineIds((current) => {
      if (!checked) return current.filter((idValue) => !visibleIds.includes(idValue));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function toggleLineComment(idValue: string) {
    setOpenCommentLineIds((current) =>
      current.includes(idValue) ? current.filter((id) => id !== idValue) : [...current, idValue],
    );
  }

  function applyPresetSet(name: string) {
    const preset = catalog.presetSets.find((set) => set.name === name);
    if (!preset?.lineIds?.length) {
      setNotice(`У набора ${name} нет сохраненного состава`);
      return;
    }
    const ids = new Set(preset.lineIds);
    setCatalog((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        ids.has(line.id) ? { ...line, manualInclude: true, excluded: false } : line,
      ),
    }));
    setNotice(`Набор применен: ${name}`);
  }

  function addSelectedToPresetSet(name: string) {
    if (!selectedConfigLineIds.length) {
      setNotice("Выберите строки, которые нужно добавить в набор");
      return;
    }
    setCatalog((current) => ({
      ...current,
      presetSets: current.presetSets.map((preset) =>
        preset.name === name
          ? {
            ...preset,
            lineIds: Array.from(new Set([...(preset.lineIds ?? []), ...selectedConfigLineIds])),
            description: `Пользовательский набор: ${Array.from(new Set([...(preset.lineIds ?? []), ...selectedConfigLineIds])).length} строк`,
          }
          : preset,
      ),
    }));
    setSelectedConfigLineIds([]);
    setNotice(`Выбранные строки добавлены в набор: ${name}`);
  }

  function applyBuiltInPreset(key: keyof Pick<ProjectInput, "includeCommon" | "presetPdOks" | "presetPdLinear" | "presetRdFull" | "presetRdCore" | "presetRdFrequent">) {
    setProject((current) => ({ ...current, [key]: true }));
    setNotice("Шаблон состава применен");
  }

  function calculateNow() {
    setNotice(`Расчет обновлен: ${new Date().toLocaleString("ru-RU")}`);
  }

  function compareWithSbc() {
    setShowSbcComparison(true);
    setNotice(`Сравнение с СБЦ обновлено: ${new Date().toLocaleString("ru-RU")}`);
  }

  function updateRate(code: string, patch: Partial<RateGroup>) {
    setCatalog((current) => ({
      ...current,
      rates: current.rates.map((rate) => (rate.code === code ? { ...rate, ...patch } : rate)),
    }));
  }

  function updateRateGroup(groupCode: string, patch: { description?: string; monthlySalaryMedian?: number }) {
    const definition = rateDefinitions.find((group) => group.code === groupCode);
    const codes = definition?.codes ?? [groupCode];
    setCatalog((current) => {
      const ratesByCode = new Map(current.rates.map((rate) => [rate.code, rate]));
      codes.forEach((code) => {
        const currentRate = ratesByCode.get(code);
        ratesByCode.set(code, {
          code,
          group: patch.description ?? currentRate?.group ?? definition?.description ?? groupCode,
          monthlySalaryMedian: patch.monthlySalaryMedian ?? currentRate?.monthlySalaryMedian ?? 0,
          comment: currentRate?.comment ?? "Группа из GUI",
        });
      });
      return { ...current, rates: Array.from(ratesByCode.values()) };
    });
  }

  function updateEstimateFilter<K extends keyof EstimateFilters>(key: K, value: EstimateFilters[K]) {
    setEstimateFilters((current) => ({ ...current, [key]: value }));
  }

  function resetEstimateFilters() {
    setQuery("");
    setEstimateFilters(emptyEstimateFilters);
    setSortState(null);
    setOpenHeaderMenu(null);
  }

  function addRate() {
    const code = prompt("Код новой группы", "НОВ");
    if (!code) return;
    if (catalog.rates.some((rate) => rate.code === code)) {
      setNotice(`Группа ${code} уже есть`);
      return;
    }
    setCatalog((current) => ({
      ...current,
      rates: [
        ...current.rates,
        {
          code,
          group: "Новая группа",
          monthlySalaryMedian: 0,
          comment: "Добавлено в GUI",
        },
      ],
    }));
    setNotice(`Добавлена группа ${code}`);
  }

  function deleteRate(code: string) {
    if (catalog.lines.some((line) => getRateGroupCode(line.departmentCode) === code)) {
      setNotice(`Группа ${code} используется в расчете`);
      return;
    }
    setCatalog((current) => ({
      ...current,
      rates: current.rates.filter((rate) => rate.code !== code),
    }));
  }

  function addManualLine() {
    const nextNumber = catalog.lines.filter((line) => line.source === "Ручная").length + 1;
    const manualLine: EstimateLine = {
      id: `MANUAL.${nextNumber}.${Date.now()}`,
      source: "Ручная",
      costGroup: "Прочее",
      category: "Ручные строки",
      section: "Дополнительно",
      name: "Новая ручная работа",
      performer: "ДПР",
      staffRole: "Ведущий",
      departmentCode: "ГИП",
      calculationType: "Ручной",
      presetPdOks: false,
      presetPdLinear: false,
      presetRdFull: false,
      presetRdCore: false,
      presetRdFrequent: false,
      common: false,
      manualInclude: true,
      excluded: false,
      workUnits: 1,
      chiefUnits: 0,
      leadUnits: 1,
      engineerUnits: 0,
      durationDays: 1,
      manualAmount: 0,
      coefficient: 1,
      comment: null,
    };
    setCatalog((current) => ({ ...current, lines: [...current.lines, manualLine] }));
    setQuery(manualLine.id);
    setView("estimate");
  }

  function addSectionFiveLine() {
    const nextNumber = catalog.lines.filter((line) => line.id.startsWith("ПП87.ОКС.5.USER")).length + 1;
    const newLine: EstimateLine = {
      id: `ПП87.ОКС.5.USER.${nextNumber}.${Date.now()}`,
      source: "ПП87",
      costGroup: "ПД",
      category: "ПД ОКС",
      section: "Новый подраздел",
      name: "Новая работа раздела 5",
      performer: "ДПР",
      staffRole: "Ведущий",
      departmentCode: "ГИП",
      calculationType: "ФОТ",
      presetPdOks: true,
      presetPdLinear: false,
      presetRdFull: false,
      presetRdCore: false,
      presetRdFrequent: false,
      common: false,
      manualInclude: true,
      excluded: false,
      workUnits: 1,
      chiefUnits: 0,
      leadUnits: 1,
      engineerUnits: 0,
      durationDays: project.useGlobalDuration ? project.globalDurationDays : 30,
      manualAmount: 0,
      coefficient: project.useGlobalCoefficient ? project.globalCoefficient : 1,
      comment: null,
    };
    setCatalog((current) => ({ ...current, lines: [...current.lines, newLine] }));
    setQuery("");
    setEstimateFilters(emptyEstimateFilters);
    setView("estimate");
    setNotice("Добавлена строка в Раздел 5");
  }

  function addConfiguredSection() {
    const nextNumber = catalog.lines.length + 1;
    const newLine: EstimateLine = {
      id: `CONFIG.${nextNumber}.${Date.now()}`,
      source: "Ручная",
      costGroup: "Прочее",
      category: "Новый раздел",
      section: "Новый раздел",
      name: "Новая работа",
      performer: "ДПР",
      staffRole: "Ведущий",
      departmentCode: "ГИП",
      calculationType: "ФОТ",
      presetPdOks: false,
      presetPdLinear: false,
      presetRdFull: false,
      presetRdCore: false,
      presetRdFrequent: false,
      common: false,
      manualInclude: false,
      excluded: false,
      workUnits: 1,
      chiefUnits: 0,
      leadUnits: 1,
      engineerUnits: 0,
      durationDays: 30,
      manualAmount: 0,
      coefficient: 1,
      comment: "Добавлено в конфигурации",
    };
    setCatalog((current) => ({ ...current, lines: [...current.lines, newLine] }));
    setQuery(newLine.id);
    setView("configuration");
  }

  function createRdReferenceLine(mark: string): EstimateLine | null {
    const reference = catalog.rdReference.find((item) => item.mark === mark);
    if (!reference) return null;
    return {
      id: `RD.${mark}.${Date.now()}`,
      source: "РД",
      costGroup: "РД",
      category: "РД",
      section: reference.mark,
      name: reference.name,
      performer: "ДПР",
      staffRole: "Ведущий",
      departmentCode: getRateGroupCode(reference.departmentCode),
      calculationType: "ФОТ",
      presetPdOks: false,
      presetPdLinear: false,
      presetRdFull: false,
      presetRdCore: false,
      presetRdFrequent: false,
      common: false,
      manualInclude: true,
      excluded: false,
      workUnits: 1,
      chiefUnits: 0,
      leadUnits: 1,
      engineerUnits: 0,
      durationDays: project.useGlobalDuration ? project.globalDurationDays : 30,
      manualAmount: 0,
      coefficient: project.useGlobalCoefficient ? project.globalCoefficient : 1,
      comment: "Добавлено из базы РД",
    };
  }

  function toggleSelectedRdMark(mark: string, checked: boolean) {
    setSelectedRdMarks((current) =>
      checked ? Array.from(new Set([...current, mark])) : current.filter((item) => item !== mark),
    );
  }

  function addSelectedRdLines() {
    const newLines = selectedRdMarks
      .map((mark) => createRdReferenceLine(mark))
      .filter((line): line is EstimateLine => Boolean(line));
    if (!newLines.length) {
      setNotice("Выберите строки РД для добавления");
      return;
    }
    setCatalog((current) => ({ ...current, lines: [...current.lines, ...newLines] }));
    setQuery("");
    setEstimateFilters(emptyEstimateFilters);
    setSelectedRdMarks([]);
    setRdPickerOpen(false);
    setNotice(`Добавлено из базы РД: ${newLines.length}`);
  }

  async function saveCurrentTemplate() {
    const name = prompt("Название шаблона", "Шаблон оценки");
    if (!name) return;
    const timestamp = now();
    const template: EstimateTemplate = {
      id: id(),
      name,
      project,
      lines: catalog.lines,
      rates: catalog.rates,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await storage.saveTemplate(template);
    setNotice(`Шаблон сохранен: ${name}`);
    await refreshSavedData();
  }

  async function saveHistorySnapshot() {
    const snapshot = makeSnapshot(`Расчет от ${new Date().toLocaleString("ru-RU")}`, project, catalog);
    await storage.saveSnapshot(snapshot);
    setNotice("Снимок расчета добавлен в историю");
    await refreshSavedData();
  }

  async function exportWorkbook() {
    const snapshot = makeSnapshot(`Оценка проекта ${new Date().toLocaleDateString("ru-RU")}`, project, catalog);
    const bytes = await exportEstimateWorkbook(snapshot, {
      fileName: `${snapshot.name}.xlsx`,
      includeAuditSheets: true,
    });
    const path = await saveEstimateWorkbook(snapshot, bytes);
    if (path) {
      const saved = { ...snapshot, exportedPath: path };
      await storage.saveSnapshot(saved);
      setNotice(`Excel выгружен: ${path}`);
      await refreshSavedData();
    }
  }

  function loadTemplate(template: EstimateTemplate) {
    setProject(normalizeProject(template.project));
    setCatalog((current) => normalizeCatalog({ ...current, lines: template.lines, rates: template.rates }));
    setNotice(`Загружен шаблон: ${template.name}`);
    setView("summary");
  }

  function exportTemplate(template: EstimateTemplate) {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${template.name.replace(/[\\/:*?"<>|]+/g, "_")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importRates(file: File) {
    const imported = await importRatesFile(file);
    if (!imported.length) {
      setNotice("В файле ставок ничего не найдено");
      return;
    }
    setCatalog((current) => {
      const map = new Map(current.rates.map((rate) => [rate.code, rate]));
      imported.forEach((rate) => map.set(rate.code, rate));
      return { ...current, rates: Array.from(map.values()) };
    });
    setNotice(`Импортировано ставок: ${imported.length}`);
  }

  async function importTemplate(file: File) {
    const parsed = JSON.parse(await file.text()) as EstimateTemplate;
    const imported = { ...parsed, id: id(), updatedAt: now() };
    await storage.saveTemplate(imported);
    setNotice(`Импортирован шаблон: ${imported.name}`);
    await refreshSavedData();
  }

  async function deleteTemplate(templateId: string) {
    await storage.deleteTemplate(templateId);
    await refreshSavedData();
  }

  async function deleteSnapshot(snapshotId: string) {
    await storage.deleteSnapshot(snapshotId);
    await refreshSavedData();
  }

  function HeaderFilter({ column, label }: { column: EstimateColumnKey; label: string }) {
    const isOpen = openHeaderMenu === column;
    const sortMark = sortState?.key === column ? (sortState.direction === "asc" ? "↑" : "↓") : "";
    const isFiltered = Boolean(estimateFilters[column]);

    return (
      <div className="header-filter">
        <button
          className={`header-filter-button ${isFiltered || sortMark ? "active" : ""}`}
          onClick={() => setOpenHeaderMenu(isOpen ? null : column)}
          type="button"
        >
          <span>{label}</span>
          <b>{sortMark || (isFiltered ? "●" : "▾")}</b>
        </button>
        {isOpen ? (
          <div className="header-menu">
            <button type="button" onClick={() => setSortState({ key: column, direction: "asc" })}>
              Сортировать ↑
            </button>
            <button type="button" onClick={() => setSortState({ key: column, direction: "desc" })}>
              Сортировать ↓
            </button>
            <input
              autoFocus
              value={estimateFilters[column]}
              onChange={(event) => updateEstimateFilter(column, event.target.value)}
              placeholder={`Фильтр: ${label}`}
            />
            <button
              type="button"
              onClick={() => {
                updateEstimateFilter(column, "");
                if (sortState?.key === column) setSortState(null);
              }}
            >
              Очистить колонку
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function resetToSeed() {
    setProject(normalizeProject(seedCatalog.projectInput));
    setCatalog(normalizeCatalog(seedToCatalog(seedCatalog)));
    setQuery("");
    setSourceFilter("Все");
    setNotice("Данные сброшены к исходной книге");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <FileSpreadsheet size={28} />
          <div>
            <strong>Оценка проекта</strong>
            <span>ПД / РД / ФЗИП</span>
          </div>
        </div>
        <nav>
          <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>
            <Calculator size={18} /> Итог
          </button>
          <button className={view === "estimate" ? "active" : ""} onClick={() => setView("estimate")}>
            <SlidersHorizontal size={18} /> Расчет
          </button>
          <button className={view === "configuration" ? "active" : ""} onClick={() => setView("configuration")}>
            <Settings size={18} /> Конфигурация
          </button>
          <button className={view === "rates" ? "active" : ""} onClick={() => setView("rates")}>
            <FileSpreadsheet size={18} /> Ставки
          </button>
          <button className={view === "sbc" ? "active" : ""} onClick={() => setView("sbc")}>
            <Calculator size={18} /> СБЦ
          </button>
          <button className={view === "templates" ? "active" : ""} onClick={() => setView("templates")}>
            <FolderOpen size={18} /> Шаблоны
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            <History size={18} /> История
          </button>
        </nav>
        <div className="sidebar-actions">
          <button onClick={saveCurrentTemplate}>
            <Save size={18} /> Сохранить шаблон
          </button>
          <button onClick={saveHistorySnapshot}>
            <FileClock size={18} /> Снимок
          </button>
          <button className="primary" onClick={exportWorkbook}>
            <Download size={18} /> Excel
          </button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>
              {view === "summary" && "Итог"}
              {view === "estimate" && "Расчет состава работ"}
              {view === "configuration" && "Конфигурация разделов"}
              {view === "rates" && "Ставки и справочники"}
              {view === "sbc" && "Расчет по СБЦ"}
              {view === "templates" && "Шаблоны"}
              {view === "history" && "История расчетов"}
            </h1>
            <span>{notice}</span>
          </div>
          {view === "summary" ? (
            <div className="topbar-actions">
              <button onClick={compareWithSbc}>
                <Calculator size={18} /> Сравнить с СБЦ
              </button>
              <button className="primary" onClick={calculateNow}>
                <Calculator size={18} /> Рассчитать
              </button>
            </div>
          ) : (
            <button className="ghost" onClick={resetToSeed}>
              <RotateCcw size={18} /> Сбросить
            </button>
          )}
        </header>

        {view === "summary" ? (
          <div className="view-stack">
            <section className="panel">
              <div className="panel-heading">
                <h2>Параметры проекта</h2>
              </div>
              <div className="form-grid">
                <TextField label="Тип проекта" value={project.projectType ?? ""} placeholder="Например: общественное здание" onChange={(value) => updateProject("projectType", value)} />
                <TextField label="Адрес" value={project.address ?? ""} placeholder="Необязательно" onChange={(value) => updateProject("address", value)} />
                <TextField label="Заказчик" value={project.customer ?? ""} placeholder="Необязательно" onChange={(value) => updateProject("customer", value)} />
                <NumberField label="Площадь объекта" value={project.area} min={0} onChange={(value) => updateProject("area", value)} suffix="м²" />
              </div>
              <div className="subsection-title">Стадии</div>
              <div className="stage-summary-strip">
	                {activeStageOverview.length ? activeStageOverview.map((stage) => (
	                  <span key={stage.group}>
	                    <b>{stage.group}</b>
                      <NumericInput
                        value={stage.duration}
                        min={0}
                        step={1}
                        onChange={(value) => updateStageDuration(stage.group, value)}
                      />
                      дн. · {stage.rows} строк
	                  </span>
	                )) : <span>Активных стадий нет</span>}
              </div>
            </section>

            <section className="stats-grid">
              <StatCard label="Итого с НДС" value={currency.format(result.totals.totalWithVat)} tone="accent" />
              <StatCard label="Итого без НДС" value={currency.format(result.totals.totalWithoutVat)} />
              <StatCard label="Себестоимость ФОТ с НДФЛ" value={currency.format(result.totals.directWorks)} />
              <StatCard label="Накладные расходы" value={currency.format(result.totals.overheadAmount)} />
              <StatCard label="Стоимость с НДС за м²" value={compactCurrency.format(result.totals.costWithVatPerSquareMeter)} />
              <StatCard label="Активных строк" value={String(result.totals.activeRows)} />
              <StatCard label="Человекодни" value={String(result.totals.personDays)} />
              <StatCard label="Амортизация в месяц" value={compactCurrency.format(monthlyDepreciation)} />
              <StatCard label="Аванс" value={currency.format(result.finance.advanceAmount)} />
              <StatCard label="Банковская гарантия" value={currency.format(result.finance.bankGuaranteeCost)} />
            </section>

            {result.warnings.length ? (
              <section className="panel warning-panel">
                <div className="panel-heading">
                  <h2>Строки требуют внимания</h2>
                </div>
                {result.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </section>
            ) : null}

            {showSbcComparison ? (
              <section className="panel sbc-compare-panel">
                <div className="panel-heading">
                  <h2>Сравнение с СБЦ</h2>
                  <button onClick={() => setView("sbc")}>Настроить СБЦ</button>
                </div>
                <div className="stats-grid sbc-stats">
                  <StatCard label="СБЦ без НДС" value={currency.format(result.sbc.currentPriceWithoutVat)} />
                  <StatCard label="СБЦ с НДС" value={currency.format(result.sbc.currentPriceWithVat)} />
                  <StatCard
                    label="Отклонение без НДС"
                    value={currency.format(result.sbc.differenceWithoutVat)}
                    tone={result.sbc.differenceWithoutVat > 0 ? "warn" : undefined}
                  />
                  <StatCard label="Отклонение, %" value={formatPercent(result.sbc.ratioToSbc)} />
                  <StatCard label="Нормативный срок" value={`${result.sbc.normativeDurationDays} дн.`} />
                </div>
                <div className="group-summary-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Стадия</th>
                        <th>Цена СБЦ без НДС</th>
                        <th>Доля</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span className="group-pill">ПД</span></td>
                        <td>{currency.format(result.sbc.pdPriceWithoutVat)}</td>
                        <td>{formatPercent(project.sbcPdShare)}</td>
                      </tr>
                      <tr>
                        <td><span className="group-pill">РД</span></td>
                        <td>{currency.format(result.sbc.rdPriceWithoutVat)}</td>
                        <td>{formatPercent(project.sbcRdShare)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="method-note">{result.sbc.notes.join(" ")}</p>
              </section>
            ) : null}

            <section className="panel group-panel">
              <div className="panel-heading">
                <h2>Разбивка по группам затрат</h2>
              </div>
              <div className="group-summary-table prominent">
                <table>
                  <thead>
                    <tr>
                      <th>Группа</th>
                      <th>Себестоимость</th>
                      <th>Цена без НДС</th>
                      <th>₽/м²</th>
                      <th>Доля</th>
                      <th>Прибыль</th>
                      <th>% прибыли</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.groupBreakdown.map((row) => (
                      <tr key={row.group}>
                        <td><span className="group-pill">{row.group}</span></td>
                        <td>{currency.format(row.directWorks)}</td>
                        <td>{currency.format(row.totalWithoutVat)}</td>
                        <td>{compactCurrency.format(row.costPerSquareMeter)}</td>
                        <td>{formatPercent(row.share)}</td>
                        <td className={row.profit < 0 ? "negative-value" : "positive-value"}>{currency.format(row.profit)}</td>
                        <td className={row.profitRate < 0 ? "negative-value" : "positive-value"}>{formatPercent(row.profitRate)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td><span className="group-pill">Итого</span></td>
                      <td>{currency.format(result.totals.directWorks)}</td>
                      <td>{currency.format(result.totals.totalWithoutVat)}</td>
                      <td>{compactCurrency.format(result.totals.costWithoutVatPerSquareMeter)}</td>
                      <td>{formatPercent(result.totals.directWorks > 0 ? 1 : 0)}</td>
                      <td className={result.totals.commercialMarkup < 0 ? "negative-value" : "positive-value"}>
                        {currency.format(result.totals.commercialMarkup)}
                      </td>
                      <td className={result.totals.commercialMarkup < 0 ? "negative-value" : "positive-value"}>
                        {formatPercent(result.totals.directWorks > 0 ? result.totals.commercialMarkup / result.totals.directWorks : 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Коэффициенты и справочные параметры</h2>
              </div>
              <div className="form-grid">
                <NumberField label="НДС" value={project.vatRate} min={0} step={0.01} onChange={(value) => updateProject("vatRate", value)} suffix={formatPercent(project.vatRate)} />
                <NumberField label="Коммерческий коэффициент" value={project.commercialCoefficient} min={0} step={0.01} onChange={(value) => updateProject("commercialCoefficient", value)} />
                <NumberField label="Накладные расходы" value={project.overheadRate} min={0} step={0.01} onChange={(value) => updateProject("overheadRate", value)} suffix={formatPercent(project.overheadRate)} />
                <NumberField label="Буфер" value={project.bufferRate} min={0} step={0.01} onChange={(value) => updateProject("bufferRate", value)} suffix={formatPercent(project.bufferRate)} />
              </div>
              <div className="subsection-title">Амортизация техники</div>
              <div className="form-grid">
                <NumberField label="Стоимость ПК инженера" value={project.computerCost} min={0} step={1000} onChange={(value) => updateProject("computerCost", value)} suffix="₽" />
                <NumberField label="Ликвидационная стоимость" value={project.computerSalvageValue} min={0} step={1000} onChange={(value) => updateProject("computerSalvageValue", value)} suffix="₽" />
                <NumberField label="СПИ" value={project.computerUsefulLifeYears} min={0} step={0.5} onChange={(value) => updateProject("computerUsefulLifeYears", value)} suffix="лет" />
                <NumberField label="Страховые взносы" value={project.insuranceContributionRate} min={0} step={0.001} onChange={(value) => updateProject("insuranceContributionRate", value)} suffix={formatPercent(project.insuranceContributionRate)} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Финансы и ДДС</h2>
              </div>
              <div className="form-grid">
                <NumberField label="Авансирование" value={project.advanceRate} min={0} step={0.01} onChange={(value) => updateProject("advanceRate", value)} suffix={formatPercent(project.advanceRate)} />
                <MonthField label="Начало работ" value={project.workStartMonth} onChange={(value) => updateProject("workStartMonth", value)} />
                <MonthField label="Окончание работ" value={project.workEndMonth} onChange={(value) => updateProject("workEndMonth", value)} />
                <NumberField label="Ставка БГ годовая" value={project.bankGuaranteeAnnualRate} min={0} step={0.001} onChange={(value) => updateProject("bankGuaranteeAnnualRate", value)} suffix={formatPercent(project.bankGuaranteeAnnualRate)} />
              </div>
              <div className="finance-cards">
                <StatCard label="Сумма аванса" value={currency.format(result.finance.advanceAmount)} />
                <StatCard label="Остаток оплаты" value={currency.format(result.finance.remainingAmount)} />
                <StatCard label="Сумма БГ" value={currency.format(result.finance.bankGuaranteeAmount)} />
                <StatCard label="Срок БГ" value={`${result.finance.workMonths} мес.`} />
              </div>
              <div className="group-summary-table cashflow-table">
                <table>
                  <thead>
                    <tr>
                      <th>Месяц</th>
                      <th>Поступления</th>
                      <th>Расходы</th>
                      <th>БГ</th>
                      <th>ДДС</th>
                      <th>Накопительно</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.finance.cashFlow.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{currency.format(row.revenue)}</td>
                        <td>{currency.format(row.cost)}</td>
                        <td>{currency.format(row.bankGuaranteeCost)}</td>
                        <td className={row.netCashFlow < 0 ? "negative-value" : "positive-value"}>{currency.format(row.netCashFlow)}</td>
                        <td className={row.cumulativeCashFlow < 0 ? "negative-value" : "positive-value"}>{currency.format(row.cumulativeCashFlow)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {view === "estimate" ? (
          <section className="panel full">
            <div className="preset-apply-bar">
              <span>Выбрать шаблон / группу</span>
              <button onClick={() => applyBuiltInPreset("includeCommon")}>Общие</button>
              <button onClick={() => applyBuiltInPreset("presetPdOks")}>ПД ОКС</button>
              <button onClick={() => applyBuiltInPreset("presetPdLinear")}>ПД линейный</button>
              <button onClick={() => applyBuiltInPreset("presetRdFull")}>РД полный</button>
              <button onClick={() => applyBuiltInPreset("presetRdCore")}>РД ядро</button>
              <button onClick={() => applyBuiltInPreset("presetRdFrequent")}>РД часто</button>
              {catalog.presetSets.filter((preset) => preset.lineIds?.length).map((preset) => (
                <button key={preset.name} onClick={() => applyPresetSet(preset.name)}>{preset.name}</button>
              ))}
            </div>
            <div className="bulk-controls estimate-bulk-controls">
              <div>
                <Toggle label="Единый срок" checked={project.useGlobalDuration} onChange={(value) => updateProject("useGlobalDuration", value)} />
                <NumberField label="Дней" value={project.globalDurationDays} min={0} step={1} onChange={(value) => updateProject("globalDurationDays", value)} />
              </div>
              <div>
                <Toggle label="Единый коэффициент" checked={project.useGlobalCoefficient} onChange={(value) => updateProject("useGlobalCoefficient", value)} />
                <NumberField label="Значение" value={project.globalCoefficient} min={0} step={0.05} onChange={(value) => updateProject("globalCoefficient", value)} />
              </div>
            </div>
            <div className="table-toolbar">
              <div className="search">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по строкам" />
              </div>
              <button onClick={addManualLine}>
                <Plus size={18} /> Ручная строка
              </button>
              <button onClick={addSectionFiveLine}>
                <Plus size={18} /> В раздел 5
              </button>
              <select
                value={estimateFilters.group}
                onChange={(event) => updateEstimateFilter("group", event.target.value)}
                aria-label="Фильтр по стадии"
              >
                <option value="">Все стадии</option>
                {costGroups.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
              <button onClick={() => setRdPickerOpen((open) => !open)}>
                <FolderOpen size={18} /> Из базы РД
              </button>
              <button onClick={resetEstimateFilters}>
                <RotateCcw size={18} /> Фильтры
              </button>
            </div>
            {rdPickerOpen ? (
              <div className="rd-picker">
                <div className="search">
                  <Search size={18} />
                  <input value={rdQuery} onChange={(event) => setRdQuery(event.target.value)} placeholder="Поиск РД по марке или названию" />
                </div>
                <div className="rd-picker-actions">
                  <span>Выбрано: {selectedRdMarks.length}</span>
                  <button className="primary" onClick={addSelectedRdLines}>
                    <Plus size={18} /> Добавить выбранные
                  </button>
                </div>
                <div className="rd-picker-list">
                  {rdPickerItems.map((item) => (
                    <label className="rd-picker-item" key={item.mark}>
                      <input
                        type="checkbox"
                        checked={selectedRdMarks.includes(item.mark)}
                        onChange={(event) => toggleSelectedRdMark(item.mark, event.target.checked)}
                      />
                      <strong>{item.mark}</strong>
                      <span>{item.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
	                    <th><HeaderFilter column="section" label="Раздел" /></th>
	                    <th><HeaderFilter column="name" label="Наименование" /></th>
	                    <th><HeaderFilter column="code" label="Группа" /></th>
	                    <th><HeaderFilter column="type" label="Тип" /></th>
	                    <th><HeaderFilter column="workUnits" label="Состав" /></th>
                      <th><HeaderFilter column="duration" label="Дн." /></th>
                    <th><HeaderFilter column="coefficient" label="Коэф." /></th>
                    <th><HeaderFilter column="cost" label="Стоимость" /></th>
                    <th>Прим.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedVisibleStages.map((stage) => (
	                    <Fragment key={stage.group}>
	                      <tr className="stage-row" key={`${stage.group}-stage`}>
	                        <td colSpan={5}>
	                          <strong>{stage.group}</strong>
	                          <span>{stage.lines.length} строк · {formatPercent(stage.share)} · {compactCurrency.format(stage.costPerSquareMeter)} / м²</span>
	                        </td>
                          <td className="duration-cell">
                            <NumericInput
                              value={project.stageDurations?.[stage.group] ?? getDefaultStageDuration(stage.group, catalog.lines)}
                              min={0}
                              step={1}
                              onChange={(value) => updateStageDuration(stage.group, value)}
                            />
                          </td>
                          <td></td>
                        <td>{currency.format(stage.directWorks)}</td>
                        <td colSpan={2}></td>
                      </tr>
                      {stage.lines.map((line) => {
                        if (line.calculationType === "Заголовок") {
                          const subgroupCost = stage.lines
                            .filter((child) => child.id.startsWith(`${line.id}.`) && child.active)
                            .reduce((sum, child) => sum + child.workCost, 0);
                          return (
	                            <tr key={line.id} className="subgroup-row">
	                              <td>{line.section}</td>
	                              <td colSpan={6}>
	                                <strong>{line.name}</strong>
	                              </td>
                              <td className="price-cell">{currency.format(subgroupCost)}</td>
                              <td></td>
                              <td><button className="danger" onClick={() => deleteLine(line.id)} title="Удалить строку"><Trash2 size={16} /></button></td>
                            </tr>
                          );
                        }

                        return (
                          <Fragment key={line.id}>
                          <tr className={line.active ? "row-active" : ""}>
                            <td>{line.section}</td>
                            <td>
                              <div className="line-name">{line.name}</div>
                              {line.warning ? <small className="warn-text">{line.warning}</small> : null}
                            </td>
	                            <td>
	                              <select value={getRateGroupCode(line.departmentCode) ?? ""} onChange={(event) => updateLine(line.id, { departmentCode: event.target.value || null })}>
	                                <option value="">-</option>
	                                {rateGroupOptions.map((group) => (
	                                  <option key={group} value={group}>
	                                    {group}
	                                  </option>
	                              ))}
	                            </select>
	                          </td>
	                          <td>
	                            <select value={line.calculationType === "Ручная сумма" ? "Ручной" : line.calculationType ?? ""} onChange={(event) => updateLine(line.id, { calculationType: event.target.value })}>
                                <option>ФОТ</option>
                                <option>Ручной</option>
                                <option>% от общего</option>
                                <option>Заголовок</option>
	                              </select>
	                            </td>
	                          <td>
                              <StaffingCell
                                chief={line.chiefUnits ?? 0}
                                lead={line.leadUnits ?? line.workUnits}
                                engineer={line.engineerUnits ?? 0}
                                onChange={(patch) => updateLineStaffing(line.id, patch)}
                              />
                            </td>
                            <td className="duration-cell">
                              <NumericInput
                                disabled={project.useGlobalDuration}
                                value={line.durationDays}
                                min={0}
                                step={1}
                                onChange={(value) => updateLine(line.id, { durationDays: value })}
                              />
                            </td>
                          <td><NumericInput disabled={project.useGlobalCoefficient} step="0.1" value={line.coefficient} onChange={(value) => updateLine(line.id, { coefficient: value })} /></td>
                            <td
                              className="price-cell"
                              style={{ "--price-ratio": `${Math.round((line.workCost / maxVisibleCost) * 100)}%` } as CSSProperties}
                            >
                              {isManualOrPercentLine(line) ? (
                                <div className="cost-input-cell">
                                  <NumericInput value={line.manualAmount} onChange={(value) => updateLine(line.id, { manualAmount: value })} />
                                  <span>{currency.format(line.workCost)}</span>
                                </div>
                              ) : (
                                currency.format(line.workCost)
                              )}
                            </td>
                            <td>
                              <button className="tiny-button" onClick={() => toggleLineComment(line.id)} title="Комментарий">
                                {openCommentLineIds.includes(line.id) ? "-" : "+"}
                              </button>
                            </td>
                            <td><button className="danger" onClick={() => deleteLine(line.id)} title="Удалить строку"><Trash2 size={16} /></button></td>
                          </tr>
                          {openCommentLineIds.includes(line.id) ? (
                            <tr className="comment-row">
	                              <td></td>
	                              <td colSpan={8}>
                                <input
                                  value={line.comment ?? ""}
                                  placeholder="Комментарий к строке"
                                  onChange={(event) => updateLine(line.id, { comment: event.target.value || null })}
                                />
                              </td>
                              <td></td>
                            </tr>
                          ) : null}
                        </Fragment>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {view === "configuration" ? (
          <section className="panel full">
            <div className="table-toolbar">
              <div className="search">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по разделам" />
              </div>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {["Все", ...costGroups].map((source) => (
                  <option key={source}>{source}</option>
                ))}
              </select>
              <button onClick={addConfiguredSection}>
                <Plus size={18} /> Строка
              </button>
              <div className="preset-create">
                <input
                  value={presetDraftName}
                  onChange={(event) => setPresetDraftName(event.target.value)}
                  placeholder="Название набора"
                />
                <button
                  className="primary"
                  disabled={!selectedConfigLineIds.length || !presetDraftName.trim()}
                  onClick={createPresetFromSelected}
                >
                  <Save size={18} /> Создать набор ({selectedConfigLineIds.length})
                </button>
              </div>
            </div>
            <div className="preset-set-strip">
              {catalog.presetSets.map((preset) => (
	                <article className="preset-set-card" key={preset.name}>
	                  <strong>{preset.name}</strong>
	                  <span>{preset.lineIds?.length ?? 0} строк</span>
                    <div className="preset-set-actions">
                      <button
                        disabled={!selectedConfigLineIds.length}
                        onClick={() => addSelectedToPresetSet(preset.name)}
                      >
                        Добавить выбранные
                      </button>
                    </div>
	                </article>
              ))}
            </div>
            <div className="table-wrap config-table">
              <table>
                <thead>
                  <tr>
                    <th className="select-col">
                      <input
                        type="checkbox"
                        aria-label="Выбрать видимые строки"
                        checked={visibleLines.length > 0 && visibleLines.every((line) => selectedConfigLineIds.includes(line.id))}
                        onChange={(event) => toggleVisibleConfigLines(event.target.checked)}
                      />
                    </th>
                    <th>Группа затрат</th>
                      <th>Категория</th>
                      <th>Раздел / марка</th>
                      <th>Наименование</th>
                      <th>Исполнитель</th>
                      <th>Комментарий</th>
                      <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLines.map((line) => (
                    <tr key={line.id}>
                      <td className="select-col">
                        <input
                          type="checkbox"
                          aria-label={`Добавить в набор: ${line.name ?? line.id}`}
                          checked={selectedConfigLineIds.includes(line.id)}
                          onChange={(event) => toggleConfigLine(line.id, event.target.checked)}
                        />
                      </td>
                      <td>
                        <input
                          list="cost-groups"
                          value={resolveCostGroup(line)}
                          onChange={(event) => updateLine(line.id, { costGroup: event.target.value || null })}
                        />
                      </td>
                      <td><input value={line.category ?? ""} onChange={(event) => updateLine(line.id, { category: event.target.value || null })} /></td>
                      <td><input value={line.section ?? ""} onChange={(event) => updateLine(line.id, { section: event.target.value || null })} /></td>
                      <td><input value={line.name ?? ""} onChange={(event) => updateLine(line.id, { name: event.target.value })} /></td>
                      <td><input value={line.performer ?? ""} onChange={(event) => updateLine(line.id, { performer: event.target.value || null })} /></td>
                      <td><input value={line.comment ?? ""} onChange={(event) => updateLine(line.id, { comment: event.target.value || null })} /></td>
                      <td><button className="danger" onClick={() => deleteLine(line.id)} title="Удалить раздел"><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {view === "rates" ? (
          <section className="panel full">
            <div className="panel-heading">
              <h2>Стоимостные группы</h2>
              <div className="panel-actions">
                <button onClick={addRate}><Plus size={18} /> Группа</button>
                <button className="primary" onClick={saveWorkingStateToDb}><Save size={18} /> В БД</button>
                <button onClick={() => exportRatesCsv(catalog.rates).then((path) => path && setNotice(`CSV ставок сохранен: ${path}`))}><Download size={18} /> CSV</button>
                <button onClick={() => exportRatesXlsx(catalog.rates).then((path) => path && setNotice(`Excel ставок сохранен: ${path}`))}><FileSpreadsheet size={18} /> XLSX</button>
                <label className="file-button">
                  <Upload size={18} /> Импорт
                  <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => event.target.files?.[0] && importRates(event.target.files[0])} />
                </label>
              </div>
            </div>
            <div className="rates-multiplier">
              <NumberField label="Общий множитель ставок" value={project.rateMultiplier} min={0} step={0.05} onChange={(value) => updateProject("rateMultiplier", value)} />
              <NumberField label="Шаг роли" value={project.roleStepRate} min={0} step={0.01} onChange={(value) => updateProject("roleStepRate", value)} suffix={formatPercent(project.roleStepRate)} />
              <span>База ставки = ведущий специалист. Инженер ниже на шаг, главспец выше на шаг. Базовые ставки в таблице не перезаписываются.</span>
            </div>
            <div className="rate-summary">
              <table>
                <thead>
                  <tr>
                    <th>Группа</th>
                    <th>Состав</th>
                    <th>Ставок</th>
                    <th>Описание</th>
                    <th>Ведущий</th>
                    <th>Инженер</th>
                    <th>Главспец</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rateDisciplineSummary.map((group) => (
                    <tr key={group.code}>
                      <td>
                        <span className="group-pill">{group.title}</span>
                      </td>
                      <td>{group.codes.join(", ")}</td>
                      <td>{group.count}</td>
                      <td>
                        <input
                          value={group.description}
                          onChange={(event) => updateRateGroup(group.code, { description: event.target.value })}
                        />
                      </td>
                      <td>
                        <NumericInput
                          value={group.average}
                          min={0}
                          step={1000}
                          onChange={(value) => updateRateGroup(group.code, { monthlySalaryMedian: value })}
                        />
                      </td>
                      <td>{group.engineer ? currency.format(group.engineer) : "—"}</td>
                      <td>{group.chief ? currency.format(group.chief) : "—"}</td>
                      <td>
                        {"custom" in group && group.custom ? (
                          <button className="danger" onClick={() => deleteRate(group.code)} title="Удалить группу">
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {view === "sbc" ? (
          <section className="panel full">
            <div className="panel-heading">
              <h2>Методика СБЦ</h2>
              <button className="primary" onClick={() => {
                compareWithSbc();
                setView("summary");
              }}>
                <Calculator size={18} /> Авторасчет и сравнение
              </button>
            </div>
            <div className="method-note">
              СБЦ обычно считает базовую цену проектирования по натуральному показателю <b>a + b x X</b> или процентом от стоимости строительства. Затем цена переводится в текущий уровень индексом и корректируется коэффициентами условий проектирования. Здесь все параметры редактируемые, потому что конкретные значения берутся из выбранного сборника и таблицы.
            </div>
            <div className="form-grid">
              <TextField label="Сборник / таблица" value={project.sbcCollectionName} onChange={(value) => updateProject("sbcCollectionName", value)} />
              <TextField label="Базисный уровень цен" value={project.sbcBaseYear} onChange={(value) => updateProject("sbcBaseYear", value)} />
              <label className="field">
                <span>Метод расчета</span>
                <select value={project.sbcMethod} onChange={(event) => updateProject("sbcMethod", event.target.value as ProjectInput["sbcMethod"])}>
                  <option value="natural">Натуральный показатель: a + b x X</option>
                  <option value="constructionPercent">% от стоимости строительства</option>
                </select>
              </label>
              <NumberField label="Индекс к текущему уровню" value={project.sbcIndexToCurrent} min={0} step={0.01} onChange={(value) => updateProject("sbcIndexToCurrent", value)} />
            </div>
            <div className="subsection-title">Базовая цена</div>
            <div className="form-grid">
              <NumberField label="Натуральный показатель X" value={project.sbcNaturalIndicator} min={0} step={1} onChange={(value) => updateProject("sbcNaturalIndicator", value)} suffix="ед." />
              <NumberField label="Постоянная a" value={project.sbcConstantA} min={0} step={1000} onChange={(value) => updateProject("sbcConstantA", value)} suffix="₽" />
              <NumberField label="Показатель b" value={project.sbcConstantB} min={0} step={1} onChange={(value) => updateProject("sbcConstantB", value)} suffix="₽/ед." />
              <NumberField label="Стоимость строительства" value={project.sbcConstructionCost} min={0} step={1000000} onChange={(value) => updateProject("sbcConstructionCost", value)} suffix="₽" />
              <NumberField label="% проектирования" value={project.sbcDesignPercent} min={0} step={0.001} onChange={(value) => updateProject("sbcDesignPercent", value)} suffix={formatPercent(project.sbcDesignPercent)} />
            </div>
            <div className="subsection-title">Коэффициенты и стадии</div>
            <div className="form-grid">
              <NumberField label="Категория сложности / условия" value={project.sbcComplexityCoefficient} min={0} step={0.05} onChange={(value) => updateProject("sbcComplexityCoefficient", value)} />
              <NumberField label="Дополнительный коэффициент" value={project.sbcAdjustmentCoefficient} min={0} step={0.05} onChange={(value) => updateProject("sbcAdjustmentCoefficient", value)} />
              <NumberField label="Доля ПД" value={project.sbcPdShare} min={0} step={0.01} onChange={(value) => updateProject("sbcPdShare", value)} suffix={formatPercent(project.sbcPdShare)} />
              <NumberField label="Доля РД" value={project.sbcRdShare} min={0} step={0.01} onChange={(value) => updateProject("sbcRdShare", value)} suffix={formatPercent(project.sbcRdShare)} />
              <NumberField label="Базовый норматив срока" value={project.sbcBaseDurationDays} min={0} step={1} onChange={(value) => updateProject("sbcBaseDurationDays", value)} suffix="дн." />
              <NumberField label="Коэффициент срока" value={project.sbcDurationCoefficient} min={0} step={0.05} onChange={(value) => updateProject("sbcDurationCoefficient", value)} />
            </div>
            <section className="stats-grid sbc-stats">
              <StatCard label="Базовая цена" value={currency.format(result.sbc.basePrice)} />
              <StatCard label="С коэффициентами" value={currency.format(result.sbc.adjustedBasePrice)} />
              <StatCard label="Текущая без НДС" value={currency.format(result.sbc.currentPriceWithoutVat)} tone="accent" />
              <StatCard label="Текущая с НДС" value={currency.format(result.sbc.currentPriceWithVat)} />
              <StatCard label="Норматив срока" value={`${result.sbc.normativeDurationDays} дн.`} />
            </section>
          </section>
        ) : null}

        {view === "templates" ? (
          <section className="panel full">
            <div className="table-toolbar">
              <button onClick={saveCurrentTemplate}><Save size={18} /> Сохранить текущий</button>
              <label className="file-button">
                <Upload size={18} /> Импорт JSON
                <input type="file" accept="application/json" onChange={(event) => event.target.files?.[0] && importTemplate(event.target.files[0])} />
              </label>
            </div>
            <div className="cards-grid">
              {templates.map((template) => (
                <article className="item-card" key={template.id}>
                  <h3>{template.name}</h3>
                  <p>{new Date(template.updatedAt).toLocaleString("ru-RU")}</p>
                  <div className="item-actions">
                    <button onClick={() => loadTemplate(template)}><FolderOpen size={16} /> Открыть</button>
                    <button onClick={() => exportTemplate(template)}><Download size={16} /> JSON</button>
                    <button className="danger" onClick={() => deleteTemplate(template.id)}><Trash2 size={16} /></button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {view === "history" ? (
          <section className="panel full">
            <div className="table-toolbar">
              <button onClick={saveHistorySnapshot}><FileClock size={18} /> Добавить снимок</button>
            </div>
            <div className="cards-grid">
              {historyItems.map((snapshot) => (
                <article className="item-card" key={snapshot.id}>
                  <h3>{snapshot.name}</h3>
                  <p>{new Date(snapshot.createdAt).toLocaleString("ru-RU")}</p>
                  <strong>{currency.format(snapshot.result.totals.totalWithVat)}</strong>
                  <span>{snapshot.result.totals.activeRows} активных строк</span>
                  {snapshot.exportedPath ? <small>{snapshot.exportedPath}</small> : null}
                  <div className="item-actions">
                    <button onClick={() => {
                      setProject(normalizeProject(snapshot.project));
                      setCatalog(snapshot.catalog);
    setView("summary");
                    }}>
                      <FolderOpen size={16} /> Открыть
                    </button>
                    <button className="danger" onClick={() => deleteSnapshot(snapshot.id)}><Trash2 size={16} /></button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <datalist id="cost-groups">
        {costGroups.map((group) => (
          <option key={group} value={group} />
        ))}
      </datalist>
    </div>
  );
}
