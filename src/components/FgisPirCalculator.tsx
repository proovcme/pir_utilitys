import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, CircleAlert, Database, Download, ExternalLink, FileCheck2, ListTree } from "lucide-react";
import {
  fgisPirSnapshot,
  findFgisTableRow,
  getFgisBreakdownDocument,
  getFgisBreakdownTable,
  getFgisCategories,
  getFgisDocuments,
  getFgisPeriod,
  getFgisTableDocument,
  getFgisTableObjects,
  explainFgisIndicator,
  interpolateFgisPercent,
  projectPatchForFgisDocument,
  projectPatchForFgisPercentTable,
  projectPatchForFgisRow,
  recommendFgisBreakdownObject,
  resolveFgisNaturalPrice,
} from "../domain/fgisPir";
import type { FgisPirKind, ProjectInput, SbcResult } from "../domain/types";

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const constrainedSiteFactors = [
  ["traffic", "Движение транспорта или пешеходов ближе 50 м"],
  ["utilities", "Подземные сети требуют переноса или приостановки"],
  ["nearby", "Существующие здания или сохраняемые насаждения ближе 50 м"],
  ["storage", "Нет площадки для складирования материалов"],
  ["crane", "Ограничен поворот стрелы крана по ПОС"],
] as const;

function NumericField({
  label,
  value,
  step,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  suffix?: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-affix">
        <input
          type="number"
          min={0}
          step={step}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = Number(event.target.value.replace(",", "."));
            if (Number.isFinite(parsed)) onChange(Math.max(0, parsed));
          }}
          onBlur={() => setDraft(String(value))}
        />
        {suffix ? <b>{suffix}</b> : null}
      </div>
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

export function FgisPirCalculator({
  project,
  result,
  onChange,
  onCompare,
  onExport,
  exporting = false,
}: {
  project: ProjectInput;
  result: SbcResult;
  onChange: (patch: Partial<ProjectInput>) => void;
  onCompare?: () => void;
  onExport?: () => void;
  exporting?: boolean;
}) {
  const period = getFgisPeriod(project.sbcFgisPeriodId);
  const kind = project.sbcFgisKind;
  const documents = useMemo(() => getFgisDocuments(period, kind), [kind, period]);
  const firstStructuredDocument = documents.find((document) => getFgisTableDocument(document.guid));
  const selectedDocument =
    documents.find((document) => document.guid === project.sbcFgisNormGuid) ??
    firstStructuredDocument ??
    documents[0];
  const categories = useMemo(() => getFgisCategories(documents), [documents]);
  const [category, setCategory] = useState(selectedDocument?.category ?? categories[0] ?? "");
  const categoryDocuments = useMemo(
    () => documents.filter((document) => document.category === category),
    [category, documents],
  );
  const tableDocument = selectedDocument ? getFgisTableDocument(selectedDocument.guid) : undefined;
  const selectedPercentTable = tableDocument?.percentTables?.find(
    (table) => table.code === project.sbcFgisTableCode,
  );
  const selectedTable = selectedPercentTable
    ? undefined
    : (
        tableDocument?.tables.find((table) => table.code === project.sbcFgisTableCode) ??
        tableDocument?.tables[0]
      );
  const tableObjects = selectedTable ? getFgisTableObjects(selectedTable) : [];
  const selectedObject = tableObjects.includes(project.sbcFgisObjectName ?? "")
    ? project.sbcFgisObjectName ?? ""
    : tableObjects[0] ?? "";
  const selectedRow = selectedTable
    ? findFgisTableRow(selectedTable, selectedObject, project.sbcNaturalIndicator)
    : undefined;
  const naturalResolution = selectedTable
    ? resolveFgisNaturalPrice(selectedTable, selectedObject, project.sbcNaturalIndicator)
    : undefined;
  const appliedRow = selectedRow ?? naturalResolution?.sourceRow;
  const breakdownDocument = selectedDocument
    ? getFgisBreakdownDocument(selectedDocument.guid)
    : undefined;
  const fixedBreakdownTable = getFgisBreakdownTable(
    breakdownDocument,
    selectedPercentTable ? undefined : selectedTable?.code,
  );
  const selectedBreakdownTable = selectedPercentTable
    ? (
        breakdownDocument?.tables.find((table) => table.code === project.sbcFgisBreakdownTableCode) ??
        breakdownDocument?.tables[0]
      )
    : fixedBreakdownTable;
  const recommendedBreakdownObject = recommendFgisBreakdownObject(
    selectedBreakdownTable,
    selectedRow?.objectName ?? selectedObject,
  );
  const selectedBreakdownObject =
    selectedBreakdownTable?.objects.find((item) => item.id === project.sbcFgisBreakdownObjectId) ??
    recommendedBreakdownObject;
  const interpolatedPercent = selectedPercentTable
    ? interpolateFgisPercent(
        selectedPercentTable,
        project.sbcConstructionCost * (project.sbcConstructionRebaseCoefficient ?? 1),
      )
    : undefined;

  useEffect(() => {
    if (!categories.includes(category)) setCategory(selectedDocument?.category ?? categories[0] ?? "");
  }, [categories, category, selectedDocument?.category]);

  useEffect(() => {
    if (!selectedDocument) return;
    const selectionMatches =
      project.sbcFgisNormGuid === selectedDocument.guid &&
      project.sbcFgisPeriodId === period.id &&
      project.sbcFgisKind === kind &&
      project.sbcFgisCatalogSha256 === fgisPirSnapshot.catalogSha256;
    if (!selectionMatches) onChange(projectPatchForFgisDocument(project, period, kind, selectedDocument));
  }, [kind, onChange, period, project, selectedDocument]);

  useEffect(() => {
    if (!selectedTable || !selectedObject) return;
    const selectionMetadataMatches =
      project.sbcFgisTableCode === selectedTable.code &&
      project.sbcFgisObjectName === selectedObject;
    if (selectionMetadataMatches && selectedRow) {
      const rowMatches =
        project.sbcFgisIndicatorRange === selectedRow.rangeLabel &&
        project.sbcConstantA === selectedRow.aThousandRub * 1000 &&
        project.sbcConstantB === selectedRow.bThousandRubPerUnit * 1000;
      if (!rowMatches) onChange(projectPatchForFgisRow(selectedTable, selectedRow, project.sbcNaturalIndicator));
      return;
    }
    if (selectionMetadataMatches) return;

    const initialRow = selectedTable.rows.find(
      (row) => row.objectName === selectedObject && (row.min !== null || row.max !== null),
    );
    if (!initialRow) return;
    const initialIndicator = initialRow.min && initialRow.min > 0
      ? initialRow.min
      : initialRow.max ?? 1;
    onChange(projectPatchForFgisRow(selectedTable, initialRow, initialIndicator));
  }, [onChange, project, selectedObject, selectedRow, selectedTable]);

  useEffect(() => {
    if (!selectedPercentTable) return;
    const patch = projectPatchForFgisPercentTable(
      selectedPercentTable,
      project.sbcConstructionCost,
      project.sbcConstructionRebaseCoefficient ?? 1,
    );
    if (
      project.sbcMethod !== patch.sbcMethod ||
      project.sbcDesignPercent !== patch.sbcDesignPercent ||
      project.sbcFgisIndicatorRange !== patch.sbcFgisIndicatorRange
    ) {
      onChange(patch);
    }
  }, [onChange, project, selectedPercentTable]);

  useEffect(() => {
    if (!breakdownDocument || !selectedBreakdownTable || !selectedBreakdownObject) return;
    const officialPdShare = breakdownDocument.stageShares.pd / 100;
    const officialRdShare = breakdownDocument.stageShares.rd / 100;
    if (
      project.sbcFgisBreakdownTableCode !== selectedBreakdownTable.code ||
      project.sbcFgisBreakdownObjectId !== selectedBreakdownObject.id ||
      project.sbcPdShare !== officialPdShare ||
      project.sbcRdShare !== officialRdShare
    ) {
      onChange({
        sbcFgisBreakdownTableCode: selectedBreakdownTable.code,
        sbcFgisBreakdownObjectId: selectedBreakdownObject.id,
        sbcPdShare: officialPdShare,
        sbcRdShare: officialRdShare,
      });
    }
  }, [breakdownDocument, onChange, project, selectedBreakdownObject, selectedBreakdownTable]);

  function selectDocument(guid: string) {
    const document = documents.find((item) => item.guid === guid);
    if (!document) return;
    setCategory(document.category);
    onChange({
      ...projectPatchForFgisDocument(project, period, kind, document),
      sbcFgisTableCode: "",
      sbcFgisTableTitle: "",
      sbcFgisObjectName: "",
      sbcFgisIndicatorUnit: "",
      sbcFgisIndicatorRange: "",
      sbcFgisTablePage: undefined,
      sbcFgisBreakdownTableCode: "",
      sbcFgisBreakdownObjectId: "",
    });
  }

  function selectCategory(nextCategory: string) {
    const documentsInCategory = documents.filter((document) => document.category === nextCategory);
    const nextDocument =
      documentsInCategory.find((document) => getFgisTableDocument(document.guid)) ??
      documentsInCategory[0];
    setCategory(nextCategory);
    if (nextDocument) onChange({
      ...projectPatchForFgisDocument(project, period, kind, nextDocument),
      sbcFgisTableCode: "",
      sbcFgisTableTitle: "",
      sbcFgisObjectName: "",
      sbcFgisIndicatorUnit: "",
      sbcFgisIndicatorRange: "",
      sbcFgisTablePage: undefined,
      sbcFgisBreakdownTableCode: "",
      sbcFgisBreakdownObjectId: "",
    });
  }

  function selectKind(nextKind: FgisPirKind) {
    const nextDocuments = getFgisDocuments(period, nextKind);
    const nextDocument =
      nextDocuments.find((document) => getFgisTableDocument(document.guid)) ??
      nextDocuments[0];
    if (!nextDocument) return;
    setCategory(nextDocument.category);
    onChange({
      ...projectPatchForFgisDocument(project, period, nextKind, nextDocument),
      sbcFgisTableCode: "",
      sbcFgisTableTitle: "",
      sbcFgisObjectName: "",
      sbcFgisIndicatorUnit: "",
      sbcFgisIndicatorRange: "",
      sbcFgisTablePage: undefined,
      sbcFgisBreakdownTableCode: "",
      sbcFgisBreakdownObjectId: "",
    });
  }

  function selectPeriod(periodId: number) {
    const nextPeriod = getFgisPeriod(periodId);
    const nextDocuments = getFgisDocuments(nextPeriod, kind);
    const nextDocument =
      nextDocuments.find((document) => getFgisTableDocument(document.guid)) ??
      nextDocuments[0];
    if (!nextDocument) return;
    setCategory(nextDocument.category);
    onChange({
      ...projectPatchForFgisDocument(project, nextPeriod, kind, nextDocument),
      sbcFgisTableCode: "",
      sbcFgisTableTitle: "",
      sbcFgisObjectName: "",
      sbcFgisIndicatorUnit: "",
      sbcFgisIndicatorRange: "",
      sbcFgisTablePage: undefined,
      sbcFgisBreakdownTableCode: "",
      sbcFgisBreakdownObjectId: "",
    });
  }

  function selectTable(code: string) {
    const table = tableDocument?.tables.find((item) => item.code === code);
    const percentTable = tableDocument?.percentTables?.find((item) => item.code === code);
    if (percentTable) {
      const firstCost = percentTable.points[0]?.constructionCostMillionRub * 1_000_000 || 40_000_000;
      const firstBreakdownTable = breakdownDocument?.tables[0];
      const firstBreakdownObject = firstBreakdownTable?.objects[0];
      onChange({
        ...projectPatchForFgisPercentTable(percentTable, firstCost),
        sbcFgisBreakdownTableCode: firstBreakdownTable?.code,
        sbcFgisBreakdownObjectId: firstBreakdownObject?.id,
      });
      return;
    }
    const objectName = table ? getFgisTableObjects(table)[0] : undefined;
    const row = table?.rows.find(
      (item) => item.objectName === objectName && (item.min !== null || item.max !== null),
    );
    if (!table || !row) return;
    const indicator = row.min && row.min > 0 ? row.min : row.max ?? 1;
    onChange(projectPatchForFgisRow(table, row, indicator));
  }

  function selectBreakdownTable(code: string) {
    const table = breakdownDocument?.tables.find((item) => item.code === code);
    const object = table?.objects[0];
    if (!table || !object) return;
    onChange({
      sbcFgisBreakdownTableCode: table.code,
      sbcFgisBreakdownObjectId: object.id,
    });
  }

  function selectBreakdownObject(id: string) {
    if (!selectedBreakdownTable?.objects.some((item) => item.id === id)) return;
    onChange({ sbcFgisBreakdownObjectId: id });
  }

  function changeConstructionCost(value: number) {
    if (!selectedPercentTable) {
      onChange({ sbcConstructionCost: value });
      return;
    }
    onChange(projectPatchForFgisPercentTable(
      selectedPercentTable,
      value,
      project.sbcConstructionRebaseCoefficient ?? 1,
    ));
  }

  function changeConstructionRebaseCoefficient(value: number) {
    if (!selectedPercentTable) {
      onChange({ sbcConstructionRebaseCoefficient: value });
      return;
    }
    onChange(projectPatchForFgisPercentTable(selectedPercentTable, project.sbcConstructionCost, value));
  }

  function selectObject(objectName: string) {
    const row = selectedTable?.rows.find(
      (item) => item.objectName === objectName && (item.min !== null || item.max !== null),
    );
    if (!selectedTable || !row) return;
    const indicator = row.min && row.min > 0 ? row.min : row.max ?? 1;
    onChange(projectPatchForFgisRow(selectedTable, row, indicator));
  }

  function changeNaturalIndicator(indicator: number) {
    if (!selectedTable) {
      onChange({ sbcNaturalIndicator: indicator });
      return;
    }
    const resolution = resolveFgisNaturalPrice(selectedTable, selectedObject, indicator);
    const row = resolution.sourceRow;
    onChange(
      row
        ? projectPatchForFgisRow(selectedTable, row, indicator)
        : {
            sbcNaturalIndicator: indicator,
            sbcFgisIndicatorRange: "",
            sbcFgisTablePage: undefined,
          },
    );
  }

  function toggleConstrainedFactor(id: string, checked: boolean) {
    const next = new Set(project.sbcConstrainedSiteFactors ?? []);
    if (checked) next.add(id);
    else next.delete(id);
    onChange({ sbcConstrainedSiteFactors: [...next] });
  }

  if (!selectedDocument) {
    return <div className="fgis-empty">В официальном снимке нет нормативов для выбранного периода.</div>;
  }

  const baseFormula =
    result.normativeTrace.formula || (project.sbcMethod === "natural"
      ? `${currency.format(project.sbcConstantA)} + ${currency.format(project.sbcConstantB)}/${selectedRow?.unit ?? project.sbcFgisIndicatorUnit ?? "ед."} × ${number.format(project.sbcNaturalIndicator)} ${selectedRow?.unit ?? project.sbcFgisIndicatorUnit ?? "ед."}`
      : `${currency.format(project.sbcConstructionCost)} × ${number.format(project.sbcDesignPercent * 100)}%`);
  const isSurveyMethod = kind === "survey";
  const indicatorUnit = selectedRow?.unit ?? project.sbcFgisIndicatorUnit ?? "ед.";
  const indicatorExplanation = explainFgisIndicator(
    indicatorUnit,
    selectedRow?.objectName ?? project.sbcFgisObjectName ?? selectedObject,
  );
  const coefficientProduct = result.normativeTrace.totalCoefficient;
  const stageShareSum = Math.max(0, project.sbcPdShare) + Math.max(0, project.sbcRdShare);
  const stageShareDenominator = stageShareSum > 1 ? stageShareSum : 1;
  const effectivePdShare = Math.max(0, project.sbcPdShare) / stageShareDenominator;
  const effectiveRdShare = Math.max(0, project.sbcRdShare) / stageShareDenominator;
  const effectiveOtherShare = Math.max(0, 1 - effectivePdShare - effectiveRdShare);

  return (
    <section className="fgis-calculator">
      <div className="fgis-intro">
        <div>
          <span className="fgis-kicker">ФГИС ЦС · ПИР</span>
          <h2>Нормативный расчёт без поиска по вкладкам</h2>
          <p>Выберите вид работ и норматив. Уровень цен и квартальный индекс подставятся из официального снимка.</p>
        </div>
        <div className="fgis-sync-state">
          <CheckCircle2 size={18} />
          <div>
            <strong>{fgisPirSnapshot.download.documentCount} документов скачано</strong>
            <span>снимок {new Date(fgisPirSnapshot.fetchedAt).toLocaleDateString("ru-RU")}</span>
          </div>
        </div>
      </div>

      <div className="fgis-purpose">
        <BookOpen size={22} />
        <div>
          <h3>Нормативный расчёт стоимости проектирования</h3>
          <p>Определяет обоснованную стоимость подготовки проектной и рабочей документации по нормативам Минстроя и переводит её в выбранный текущий уровень цен.</p>
          <div className="fgis-purpose-grid">
            <span><b>Для чего</b> Обоснование цены ПИР, договора и сметы на проектные работы.</span>
            <span><b>Что получите</b> Общую стоимость, ПД и РД, стоимость каждого раздела, НДС и паспорт источника.</span>
            <span><b>Чем не является</b> Это не локальная или объектная смета строительства и не расчёт материалов и СМР.</span>
          </div>
        </div>
      </div>

      <details className="fgis-user-guide" open>
        <summary><span>Как выполнить расчёт</span><small>Пошаговое руководство</small></summary>
        <ol>
          <li><b>Выберите норматив.</b> Найдите назначение объекта и документ, который прямо к нему относится.</li>
          <li><b>Выберите объект.</b> Укажите строку таблицы, наиболее точно совпадающую с проектируемым объектом.</li>
          <li><b>Введите показатель.</b> Площадь, вместимость, объём или другой показатель берите из задания на проектирование либо утверждённых ТЭП.</li>
          <li><b>Проверьте условия.</b> Применяйте коэффициенты только при наличии основания в выбранном нормативе.</li>
          <li><b>Проверьте выдачу.</b> Сумма будет показана по стадиям ПД/РД и по всем разделам; источник и страница остаются рядом.</li>
        </ol>
      </details>

      <div className="fgis-workbench">
        <div className="fgis-flow">
          <section className="fgis-step">
            <span className="fgis-step-number">01</span>
            <div className="fgis-step-content">
              <h3>Что считаем</h3>
              <div className="fgis-segment" role="group" aria-label="Вид работ">
                <button className={kind === "design" ? "active" : ""} onClick={() => selectKind("design")}>
                  Проектные работы
                  <small>{period.design.documents.length} нормативов</small>
                </button>
                <button className={kind === "survey" ? "active" : ""} onClick={() => selectKind("survey")}>
                  Инженерные изыскания
                  <small>{period.survey.documents.length} нормативов</small>
                </button>
              </div>
            </div>
          </section>

          <section className="fgis-step">
            <span className="fgis-step-number">02</span>
            <div className="fgis-step-content">
              <h3>Норматив ФГИС</h3>
              <div className="fgis-select-grid">
                <label className="field">
                  <span>Категория</span>
                  <select value={category} onChange={(event) => selectCategory(event.target.value)}>
                    {categories.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Документ</span>
                  <select value={selectedDocument.guid} onChange={(event) => selectDocument(event.target.value)}>
                    {categoryDocuments.map((document) => (
                      <option key={document.guid} value={document.guid}>{document.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Текущий уровень цен</span>
                  <select value={period.id} onChange={(event) => selectPeriod(Number(event.target.value))}>
                    {fgisPirSnapshot.periods.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="fgis-step">
            <span className="fgis-step-number">03</span>
            <div className="fgis-step-content">
              <h3>{isSurveyMethod ? "Состав изыскательских работ" : "Объект и натуральный показатель"}</h3>

              {isSurveyMethod ? (
                <div className="fgis-method-state warning">
                  <CircleAlert size={19} />
                  <div>
                    <strong>Для изысканий формула a + b × X не применяется универсально</strong>
                    <p>Нужно выбрать виды и объёмы работ из таблиц показателей затрат ПЗ выбранного документа. Пока доступен паспорт и официальный PDF; ложный автоматический итог отключён.</p>
                  </div>
                </div>
              ) : selectedPercentTable ? (
                <>
                  <div className="fgis-table-choice-grid">
                    <label className="field">
                      <span>Способ расчёта и таблица</span>
                      <select value={selectedPercentTable.code} onChange={(event) => selectTable(event.target.value)}>
                        {tableDocument?.tables.map((table) => (
                          <option key={table.code} value={table.code}>{table.code} · {table.title}</option>
                        ))}
                        {tableDocument?.percentTables?.map((table) => (
                          <option key={table.code} value={table.code}>{table.code} · {table.title}</option>
                        ))}
                      </select>
                      <small className="field-hint">Используйте таблицу 3.18, только если нужного объекта нет в таблицах 3.1–3.17.</small>
                    </label>
                  </div>
                  <div className="fgis-indicator-workbench">
                    <NumericField
                      label="Исходная стоимость строительства"
                      value={project.sbcConstructionCost}
                      step={1_000_000}
                      suffix="₽"
                      hint="СМР, оборудование, мебель и инвентарь. Укажите стоимость в имеющемся уровне цен."
                      onChange={changeConstructionCost}
                    />
                    <NumericField
                      label="Коэффициент к уровню 01.01.2021"
                      value={project.sbcConstructionRebaseCoefficient ?? 1}
                      step={0.01}
                      hint="Если стоимость уже дана на 01.01.2021, оставьте 1. Иначе укажите документированный коэффициент пересчёта."
                      onChange={changeConstructionRebaseCoefficient}
                    />
                    <NumericField
                      label="Доля СМР"
                      value={project.sbcSmrSharePercent ?? 60}
                      step={1}
                      suffix="%"
                      hint="Доля строительно-монтажных работ в общей стоимости строительства. Она определяет коэффициент по п. 140 Методики."
                      onChange={(value) => onChange({ sbcSmrSharePercent: value })}
                    />
                    {interpolatedPercent ? (
                      <div className="fgis-applied-row">
                        <div className="fgis-applied-row-title">
                          <FileCheck2 size={18} />
                          <strong>Норматив выбран автоматически</strong>
                        </div>
                        <dl>
                          <div><dt>Стоимость в уровне норматива</dt><dd>{currency.format(project.sbcConstructionCost * (project.sbcConstructionRebaseCoefficient ?? 1))}</dd></div>
                          <div><dt>Норматив проектирования</dt><dd>{number.format(interpolatedPercent.percent)}% от стоимости строительства</dd></div>
                          <div><dt>Коэффициент доли СМР</dt><dd>{number.format(result.normativeTrace.smrShareCoefficient)}</dd></div>
                          <div><dt>Интервал</dt><dd>{interpolatedPercent.lower.constructionCostMillionRub}–{interpolatedPercent.upper.constructionCostMillionRub} млн ₽</dd></div>
                          <div><dt>Правило</dt><dd>{interpolatedPercent.clamped ? "Применено крайнее опубликованное значение без экстраполяции" : "Значение определено интерполяцией между соседними строками"}</dd></div>
                          <div><dt>Источник</dt><dd>таблица 3.18, стр. {interpolatedPercent.lower.page}</dd></div>
                        </dl>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : selectedTable ? (
                <>
                  <div className="fgis-table-choice-grid">
                    <label className="field">
                      <span>Таблица норматива</span>
                      <select value={selectedTable.code} onChange={(event) => selectTable(event.target.value)}>
                        {tableDocument?.tables.map((table) => (
                          <option key={table.code} value={table.code}>{table.code} · {table.title}</option>
                        ))}
                        {tableDocument?.percentTables?.map((table) => (
                          <option key={table.code} value={table.code}>{table.code} · {table.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Объект проектирования</span>
                      <select value={selectedObject} onChange={(event) => selectObject(event.target.value)}>
                        {tableObjects.map((objectName) => <option key={objectName}>{objectName}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="fgis-indicator-workbench">
                    <NumericField
                      label={indicatorExplanation.label}
                      value={project.sbcNaturalIndicator}
                      step={1}
                      suffix={indicatorUnit}
                      hint={`${indicatorExplanation.description} ${indicatorExplanation.sourceHint}`}
                      onChange={changeNaturalIndicator}
                    />
                    {naturalResolution?.valid && appliedRow ? (
                      <div className="fgis-applied-row">
                        <div className="fgis-applied-row-title">
                          <FileCheck2 size={18} />
                          <strong>{naturalResolution.ruleCode === "8.1" ? "Строка выбрана автоматически" : `Применена формула ${naturalResolution.ruleCode}`}</strong>
                        </div>
                        <dl>
                          <div><dt>Показатель</dt><dd>{indicatorExplanation.label}</dd></div>
                          <div><dt>Опорный диапазон</dt><dd>{appliedRow.rangeLabel} {appliedRow.unit}</dd></div>
                          <div><dt>Постоянная a</dt><dd>{number.format(appliedRow.aThousandRub)} тыс. ₽ — фиксированная часть базовой цены</dd></div>
                          <div><dt>Показатель b</dt><dd>{number.format(appliedRow.bThousandRubPerUnit)} тыс. ₽/{appliedRow.unit} — цена единицы X</dd></div>
                          <div><dt>Правило</dt><dd>{naturalResolution.explanation}</dd></div>
                          <div><dt>Источник</dt><dd>таблица {selectedTable.code}, стр. {appliedRow.page}; {naturalResolution.sourceParagraph}</dd></div>
                        </dl>
                      </div>
                    ) : (
                      <div className="fgis-method-state warning compact">
                        <CircleAlert size={18} />
                        <div>
                          <strong>Расчёт для этого значения невозможен</strong>
                          <p>{naturalResolution?.blocker ?? "Для показателя нет применимого нормативного правила."}</p>
                        </div>
                      </div>
                    )}
                  </div>

                </>
              ) : (
                <>
                  <div className="fgis-method-state">
                    <CircleAlert size={19} />
                    <div>
                      <strong>Таблицы этого документа ещё не структурированы</strong>
                      <p>Откройте официальный PDF и выберите метод и строку вручную. Автоматический выбор показателя для этого норматива пока не заявлен.</p>
                    </div>
                  </div>
                  <label className="field fgis-method-field">
                    <span>Метод из выбранной таблицы</span>
                    <select
                      value={project.sbcMethod}
                      onChange={(event) => onChange({ sbcMethod: event.target.value as ProjectInput["sbcMethod"] })}
                    >
                      <option value="natural">a + b × X</option>
                      <option value="constructionPercent">Процент от стоимости строительства</option>
                    </select>
                  </label>
                  <div className="fgis-input-grid">
                    {project.sbcMethod === "natural" ? (
                      <>
                        <NumericField label="Постоянная a" value={project.sbcConstantA} step={1000} suffix="₽" hint="Фиксированная часть базовой цены из выбранной строки таблицы." onChange={(value) => onChange({ sbcConstantA: value })} />
                        <NumericField label="Показатель b" value={project.sbcConstantB} step={1} suffix="₽/ед." hint="Цена одной единицы физического показателя X в базовом уровне цен." onChange={(value) => onChange({ sbcConstantB: value })} />
                        <NumericField label="Натуральный показатель X" value={project.sbcNaturalIndicator} step={1} suffix="ед." hint="Физический объём объекта из задания на проектирование или ТЭП." onChange={(value) => onChange({ sbcNaturalIndicator: value })} />
                      </>
                    ) : (
                      <>
                        <NumericField label="Стоимость строительства" value={project.sbcConstructionCost} step={1000000} suffix="₽" hint="Расчётная стоимость строительства в уровне цен, который требует выбранный норматив." onChange={(value) => onChange({ sbcConstructionCost: value })} />
                        <NumericField label="Норматив проектирования" value={project.sbcDesignPercent} step={0.001} suffix={`${number.format(project.sbcDesignPercent * 100)}%`} hint="Доля стоимости проектных работ по выбранной таблице, вводится десятичной дробью: 0,04 = 4%." onChange={(value) => onChange({ sbcDesignPercent: value })} />
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {breakdownDocument && selectedBreakdownTable && selectedBreakdownObject ? (
            <section className="fgis-step">
              <span className="fgis-step-number">04</span>
              <div className="fgis-step-content">
                <h3>Стадии и разделы</h3>
                <p className="fgis-step-lead">ФГИС распределяет общую цену сначала между ПД и РД, затем — между разделами выбранного объекта.</p>
                <div className="fgis-stage-ribbon">
                  <span><b>ПД</b><strong>{number.format(breakdownDocument.stageShares.pd)}%</strong><small>проектная документация</small></span>
                  <span><b>РД</b><strong>{number.format(breakdownDocument.stageShares.rd)}%</strong><small>рабочая документация</small></span>
                  <span><b>ПД + РД</b><strong>100%</strong><small>полный объём проектных работ</small></span>
                </div>
                <div className="fgis-table-choice-grid">
                  {selectedPercentTable ? (
                    <label className="field">
                      <span>Назначение объекта-аналога</span>
                      <select value={selectedBreakdownTable.code} onChange={(event) => selectBreakdownTable(event.target.value)}>
                        {breakdownDocument.tables.map((table) => (
                          <option key={table.code} value={table.code}>{table.code} · {table.title}</option>
                        ))}
                      </select>
                      <small className="field-hint">Для таблицы 3.18 норматив требует выбрать ближайший аналог по назначению и конструкции.</small>
                    </label>
                  ) : null}
                  <label className="field">
                    <span>{selectedPercentTable ? "Объект-аналог" : "Вариант распределения разделов"}</span>
                    <select value={selectedBreakdownObject.id} onChange={(event) => selectBreakdownObject(event.target.value)}>
                      {selectedBreakdownTable.objects.map((item) => (
                        <option key={item.id} value={item.id}>{item.id} · {item.name}</option>
                      ))}
                    </select>
                    <small className="field-hint">Проверьте вариант: он определяет долю и стоимость каждого раздела.</small>
                  </label>
                </div>
                <div className="fgis-source-note"><FileCheck2 size={17} /><span>Таблица относительной стоимости {selectedBreakdownTable.code}, стр. {selectedBreakdownObject.page}. Все проценты ниже взяты из этой строки ФГИС.</span></div>
              </div>
            </section>
          ) : null}

          <details className="fgis-advanced">
            <summary>Условия проектирования и срок</summary>
            <div className="fgis-input-grid">
              {breakdownDocument ? (
                <>
                  <label className="toggle"><input type="checkbox" checked={Boolean(project.sbcHeritageProtectionZone)} onChange={(event) => onChange({ sbcHeritageProtectionZone: event.target.checked })} /><span>Строительство в зоне охраны объекта культурного наследия</span></label>
                  {constrainedSiteFactors.map(([id, label]) => (
                    <label className="toggle" key={id}><input type="checkbox" checked={(project.sbcConstrainedSiteFactors ?? []).includes(id)} onChange={(event) => toggleConstrainedFactor(id, event.target.checked)} /><span>{label}</span></label>
                  ))}
                  <small className="field-hint">Коэффициент 1,1 применяется для зоны охраны либо при наличии не менее трёх из пяти факторов стеснённости.</small>
                  <label className="toggle"><input type="checkbox" checked={Boolean(project.sbcSpecialDefenseStatus)} onChange={(event) => onChange({ sbcSpecialDefenseStatus: event.target.checked })} /><span>Специальный объект обороны или безопасности</span></label>
                  <label className="toggle"><input type="checkbox" checked={Boolean(project.sbcParallelDesignConstruction)} onChange={(event) => onChange({ sbcParallelDesignConstruction: event.target.checked })} /><span>Проектирование и строительство выполняются параллельно</span></label>
                  <label className="toggle"><input type="checkbox" checked={Boolean(project.sbcInformationModel)} onChange={(event) => onChange({ sbcInformationModel: event.target.checked })} /><span>Требуется информационная модель</span></label>
                  <label className="toggle"><input type="checkbox" checked={Boolean(project.sbcComplexObject)} onChange={(event) => onChange({ sbcComplexObject: event.target.checked })} /><span>Комплекс, встроенный объект или повторяющиеся секции</span></label>
                </>
              ) : (
                <>
                  <NumericField label="Коэффициент условий Kусл" value={project.sbcComplexityCoefficient} step={0.05} hint="Введите только коэффициент с основанием в выбранном документе." onChange={(value) => onChange({ sbcComplexityCoefficient: value })} />
                  <NumericField label="Дополнительный коэффициент" value={project.sbcAdjustmentCoefficient} step={0.05} hint="Введите значение и проверьте основание по официальному PDF." onChange={(value) => onChange({ sbcAdjustmentCoefficient: value })} />
                </>
              )}
              {!breakdownDocument ? <NumericField label="Доля стадии ПД" value={project.sbcPdShare} step={0.01} suffix={`${number.format(project.sbcPdShare * 100)}%`} hint="Часть текущей нормативной цены, относимая к проектной документации." onChange={(value) => onChange({ sbcPdShare: value })} /> : null}
              {!breakdownDocument ? <NumericField label="Доля стадии РД" value={project.sbcRdShare} step={0.01} suffix={`${number.format(project.sbcRdShare * 100)}%`} hint="Часть текущей нормативной цены, относимая к рабочей документации." onChange={(value) => onChange({ sbcRdShare: value })} /> : null}
              <NumericField label="Базовый срок Tбаз" value={project.sbcBaseDurationDays} step={1} suffix="дн." hint="Исходная нормативная продолжительность до применения коэффициента срока." onChange={(value) => onChange({ sbcBaseDurationDays: value })} />
              <NumericField label="Коэффициент срока Kсрок" value={project.sbcDurationCoefficient} step={0.05} hint="Множитель нормативной продолжительности. Итоговый срок = Tбаз × Kсрок." onChange={(value) => onChange({ sbcDurationCoefficient: value })} />
            </div>
          </details>
        </div>

        <aside className="fgis-passport">
          <div className="fgis-result">
            <span>{isSurveyMethod ? "Нормативный расчёт" : "Текущая стоимость без НДС"}</span>
            {isSurveyMethod ? (
              <>
                <strong className="fgis-result-pending">Требуется состав работ</strong>
                <small>Итог не подменяется формулой проектных работ</small>
              </>
            ) : !result.normativeTrace.valid ? (
              <>
                <strong className="fgis-result-pending">Расчёт остановлен</strong>
                <small>{result.normativeTrace.blockers[0]}</small>
              </>
            ) : (
              <>
                <strong>{currency.format(result.currentPriceWithoutVat)}</strong>
                <small>с НДС: {currency.format(result.currentPriceWithVat)}</small>
              </>
            )}
          </div>

          <div className="fgis-formula">
            <span>Расчёт по шагам</span>
            {isSurveyMethod ? (
              <code>Σ показатели затрат выбранных работ</code>
            ) : (
              <ol className="fgis-calculation-steps">
                <li>
                  <i>1</i>
                  <div><strong>Базовая цена</strong><code>{baseFormula}</code><small>= {currency.format(result.basePrice)}</small></div>
                </li>
                <li>
                  <i>2</i>
                  <div><strong>Нормативные условия</strong><code>{currency.format(result.basePrice)} × {number.format(result.normativeTrace.totalCoefficient)}</code><small>= {currency.format(result.adjustedBasePrice)}</small></div>
                </li>
                <li>
                  <i>3</i>
                  <div><strong>Переход в текущие цены</strong><code>{currency.format(result.adjustedBasePrice)} × {number.format(project.sbcIndexToCurrent)}</code><small>= {currency.format(result.currentPriceWithoutVat)} без НДС</small></div>
                </li>
                <li>
                  <i>4</i>
                  <div><strong>НДС</strong><code>{currency.format(result.currentPriceWithoutVat)} × {number.format(1 + project.vatRate)}</code><small>= {currency.format(result.currentPriceWithVat)} с НДС</small></div>
                </li>
              </ol>
            )}
          </div>

          <details className="fgis-methodology">
            <summary>
              <span>Методика расчёта и расшифровки</span>
              <small><span className="when-closed">Развернуть</span><span className="when-open">Свернуть</span></small>
            </summary>
            <div className="fgis-methodology-body">
              {isSurveyMethod ? (
                <>
                  <p>Инженерные изыскания считаются по составу работ и показателям затрат ПЗ выбранного документа. Универсальная формула проектных работ здесь не применяется.</p>
                  <ol>
                    <li>Выберите норматив и откройте официальный PDF.</li>
                    <li>Определите необходимые виды и объёмы изысканий.</li>
                    <li>Рассчитайте каждую работу по её таблице и показателю затрат.</li>
                    <li>Сложите позиции, затем примените предусмотренные документом коэффициенты и индекс текущего периода.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>{selectedPercentTable ? "Калькулятор определяет норматив проектирования по стоимости строительства и таблице 3.18." : "Калькулятор выбирает строку официальной таблицы по объекту и диапазону показателя. Денежные параметры a и b переводятся из тыс. ₽ в ₽."}</p>
                  <ol>
                    <li><b>Базовая цена:</b> применено правило {result.normativeTrace.ruleCode}: {result.normativeTrace.ruleTitle.toLocaleLowerCase("ru-RU")}.</li>
                    <li><b>Условия:</b> применяются только выбранные условия с нормативным основанием. Общий множитель: {number.format(coefficientProduct)}.</li>
                    <li><b>Текущий уровень цен:</b> Cтек = Cусл × I. Индекс I = {number.format(project.sbcIndexToCurrent)}.</li>
                    <li><b>НДС:</b> Cндс = Cтек × (1 + {number.format(project.vatRate)}).</li>
                    <li><b>Стадии:</b> ПД {number.format(effectivePdShare * 100)}%, РД {number.format(effectiveRdShare * 100)}%, прочее {number.format(effectiveOtherShare * 100)}%.</li>
                    <li><b>Разделы:</b> стоимость стадии умножается на официальный процент соответствующего раздела.</li>
                    <li><b>Срок:</b> T = {number.format(project.sbcBaseDurationDays)} × {number.format(project.sbcDurationCoefficient)} = {number.format(result.normativeDurationDays)} дн.</li>
                  </ol>
                  <p>Расчёт не зависит от зарплатных ставок, состава команды, трудозатрат и коммерческой маржи. Эти данные относятся к отдельной коммерческой калькуляции.</p>
                  <p><b>Нормативный источник:</b> {result.normativeTrace.source}{result.normativeTrace.sourcePage ? `, стр. ${result.normativeTrace.sourcePage}` : ""}.</p>
                  {result.normativeTrace.blockers.map((item) => <p className="fgis-methodology-warning" key={item}>{item}</p>)}
                  {result.normativeTrace.warnings.map((item) => <p className="fgis-methodology-warning" key={item}>{item}</p>)}
                  {stageShareSum > 1 ? <p className="fgis-methodology-warning">Сумма введённых долей ПД и РД больше 100%, поэтому калькулятор нормализовал их пропорционально.</p> : null}
                </>
              )}

              <dl className="fgis-glossary">
                <div><dt>a</dt><dd>фиксированная часть базовой цены из строки нормативной таблицы;</dd></div>
                <div><dt>b</dt><dd>цена одной единицы натурального показателя в базовом уровне цен;</dd></div>
                <div><dt>X</dt><dd>{indicatorExplanation.label.toLocaleLowerCase("ru-RU")}: {indicatorExplanation.description}</dd></div>
                <div><dt>K</dt><dd>коэффициент применяется только при выполнении описанного в нормативе условия;</dd></div>
                <div><dt>I</dt><dd>индекс пересчёта из базового уровня цен документа в выбранный квартал ФГИС;</dd></div>
                <div><dt>ПД / РД</dt><dd>распределение рассчитанной цены между проектной и рабочей документацией;</dd></div>
              </dl>
            </div>
          </details>

          <div className="fgis-source-passport">
            <div className="fgis-passport-title"><Database size={17} /> Паспорт источника</div>
            <dl>
              <div><dt>Период</dt><dd>{period.label}</dd></div>
              <div><dt>Уровень цен</dt><dd>{selectedDocument.priceLevel ?? "не указан"}</dd></div>
              <div><dt>Индекс</dt><dd>{selectedDocument.index ?? "не опубликован"}</dd></div>
              <div><dt>Утверждение</dt><dd>{selectedDocument.approvingAct ?? "не указано"}</dd></div>
              <div><dt>Норматив</dt><dd>{selectedDocument.name}</dd></div>
              {appliedRow && selectedTable ? (
                <>
                  <div><dt>Таблица</dt><dd>{selectedTable.code} · {selectedTable.title}</dd></div>
                  <div><dt>Объект</dt><dd>{appliedRow.objectName}</dd></div>
                  <div><dt>Показатель</dt><dd>{indicatorExplanation.label}: {number.format(project.sbcNaturalIndicator)} {appliedRow.unit}</dd></div>
                  <div><dt>Опорный диапазон</dt><dd>{appliedRow.rangeLabel}</dd></div>
                  <div><dt>Правило</dt><dd>{result.normativeTrace.ruleCode}</dd></div>
                  <div><dt>Строка PDF</dt><dd>стр. {appliedRow.page}</dd></div>
                </>
              ) : null}
              {selectedPercentTable && interpolatedPercent ? (
                <>
                  <div><dt>Таблица</dt><dd>{selectedPercentTable.code} · {selectedPercentTable.title}</dd></div>
                  <div><dt>Исходная стоимость</dt><dd>{currency.format(project.sbcConstructionCost)}</dd></div>
                  <div><dt>В уровне норматива</dt><dd>{currency.format(result.normativeTrace.baseConstructionCost ?? 0)}</dd></div>
                  <div><dt>Норматив</dt><dd>{number.format(interpolatedPercent.percent)}%</dd></div>
                  <div><dt>Строка PDF</dt><dd>стр. {interpolatedPercent.lower.page}</dd></div>
                </>
              ) : null}
            </dl>
            <a href={selectedDocument.downloadUrl} target="_blank" rel="noreferrer">
              Скачать документ ФГИС <ExternalLink size={15} />
            </a>
          </div>

          {onCompare ? (
            <button className="primary fgis-compare" onClick={onCompare}>Сравнить с коммерческим расчётом</button>
          ) : null}
          <p className="fgis-digest">Каталог: {fgisPirSnapshot.catalogSha256.slice(0, 12)}…</p>
        </aside>
      </div>

      {result.officialBreakdown ? (
        <section className="fgis-output">
          <div className="fgis-output-heading">
            <div>
              <span className="fgis-kicker"><ListTree size={15} /> Полная выдача</span>
              <h3>Стоимость по стадиям и разделам</h3>
              <p>{result.officialBreakdown.objectName}. Таблица {result.officialBreakdown.tableCode}, стр. {result.officialBreakdown.page}.</p>
            </div>
            <div className="fgis-output-actions">
              <div className="fgis-output-total">
                <span>ПД + РД без НДС</span>
                <strong>{currency.format(result.currentPriceWithoutVat)}</strong>
              </div>
              {onExport ? <button className="primary fgis-export" disabled={exporting} onClick={onExport}><Download size={17} />{exporting ? "Готовим XLSX…" : "Скачать XLSX"}</button> : null}
            </div>
          </div>

          <div className="fgis-stage-totals">
            <div><span>Проектная документация · {number.format(result.officialBreakdown.pdSharePercent)}%</span><strong>{currency.format(result.pdPriceWithoutVat)}</strong></div>
            <div><span>Рабочая документация · {number.format(result.officialBreakdown.rdSharePercent)}%</span><strong>{currency.format(result.rdPriceWithoutVat)}</strong></div>
            <div><span>НДС · {number.format(project.vatRate * 100)}%</span><strong>{currency.format(result.currentPriceWithVat - result.currentPriceWithoutVat)}</strong></div>
          </div>

          <div className="fgis-breakdown-scroll">
            <table className="fgis-breakdown-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Раздел</th>
                  <th colSpan={2}>ПД</th>
                  <th colSpan={2}>РД</th>
                  <th rowSpan={2}>Всего без НДС</th>
                </tr>
                <tr>
                  <th>Доля</th><th>Стоимость</th><th>Доля</th><th>Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {result.officialBreakdown.sections.map((section) => (
                  <tr key={section.code}>
                    <th scope="row"><b>{section.code}</b><span>{section.name}</span></th>
                    <td>{section.pdSharePercent ? `${number.format(section.pdSharePercent)}%` : "—"}</td>
                    <td>{section.pdPriceWithoutVat ? currency.format(section.pdPriceWithoutVat) : "—"}</td>
                    <td>{section.rdSharePercent ? `${number.format(section.rdSharePercent)}%` : "—"}</td>
                    <td>{section.rdPriceWithoutVat ? currency.format(section.rdPriceWithoutVat) : "—"}</td>
                    <td><strong>{section.totalPriceWithoutVat ? currency.format(section.totalPriceWithoutVat) : "—"}</strong></td>
                  </tr>
                ))}
                {result.officialBreakdown.pdUnallocatedWithoutVat || result.officialBreakdown.rdUnallocatedWithoutVat ? (
                  <tr className="fgis-unallocated">
                    <th scope="row"><b>Остаток</b><span>Не распределён опубликованной строкой ФГИС</span></th>
                    <td>{number.format(Math.max(0, 100 - result.officialBreakdown.pdPublishedTotalPercent))}%</td>
                    <td>{currency.format(result.officialBreakdown.pdUnallocatedWithoutVat)}</td>
                    <td>{number.format(Math.max(0, 100 - result.officialBreakdown.rdPublishedTotalPercent))}%</td>
                    <td>{currency.format(result.officialBreakdown.rdUnallocatedWithoutVat)}</td>
                    <td><strong>{currency.format(result.officialBreakdown.pdUnallocatedWithoutVat + result.officialBreakdown.rdUnallocatedWithoutVat)}</strong></td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <th>Итого по стадии</th>
                  <td>{number.format(result.officialBreakdown.pdPublishedTotalPercent)}%</td>
                  <td>{currency.format(result.pdPriceWithoutVat)}</td>
                  <td>{number.format(result.officialBreakdown.rdPublishedTotalPercent)}%</td>
                  <td>{currency.format(result.rdPriceWithoutVat)}</td>
                  <td>{currency.format(result.currentPriceWithoutVat)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="fgis-output-note">Стоимость раздела рассчитана без НДС. НДС начисляется на общий итог. Нулевое значение означает, что выбранная строка ФГИС не относит стоимость к этому разделу.</p>
        </section>
      ) : null}

      <footer className="fgis-contact">Вопросы по применению калькулятора: <a href="https://ovc.me" target="_blank" rel="noreferrer">OVC.me</a></footer>
    </section>
  );
}
