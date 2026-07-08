import { useEffect, useMemo, useState } from "react";
import type { PrikinatorNcsLine, PrikinatorObjectId } from "../data/prikinatorNcsLines";
import {
  calculatePrikinatorBuild,
  linePriceRub,
  linesForObject,
  prikinatorObjects,
  prikinatorRegions,
  prikinatorWorks,
} from "../domain/prikinator";

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const quips = [
  "Прикинатор почти видит смету. Она прячется за исходными данными.",
  "Пока это не смета, а честный первый разговор с таблицей.",
  "Если строка сборника выбрана правильно, жить становится спокойнее.",
  "Число без источника - не расчет, а уверенная легенда.",
  "Слишком точный результат на плохих вводных обычно надо перепроверить первым.",
  "НЦС любит натуральный показатель. Прикинатор тоже, но без фанатизма.",
  "Если мощность вне таблицы, калькулятор не геройствует и показывает границу.",
  "Смета без объемов быстро становится литературой.",
  "Не несем это сразу в договор. Сначала проверяем объект, состав и коэффициенты.",
  "Хорошая прикидка обязана пережить вопрос: откуда взялось число?",
];

function formatNumber(value: number) {
  return numberFormat.format(value);
}

function lineOptionText(line: PrikinatorNcsLine) {
  return `${line.code} - ${line.title}`;
}

function parseNumericDraft(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumericDraft(value: number) {
  return String(value);
}

export function PrikinatorStandalone() {
  const [objectId, setObjectId] = useState<PrikinatorObjectId>("office");
  const objectLines = useMemo(() => linesForObject(objectId), [objectId]);
  const [lineCode, setLineCode] = useState("02-01-001-03");
  const selectedLine = (objectLines.find((line) => line.code === lineCode) ?? objectLines[0]) as PrikinatorNcsLine;
  const [capacity, setCapacity] = useState(selectedLine?.baseCapacity ?? 0);
  const [capacityDraft, setCapacityDraft] = useState(normalizeNumericDraft(selectedLine?.baseCapacity ?? 0));
  const [workId, setWorkId] = useState(prikinatorWorks[0].id);
  const [regionId, setRegionId] = useState("mo");
  const [vatRate, setVatRate] = useState(0.22);
  const [vatRateDraft, setVatRateDraft] = useState("0.22");

  useEffect(() => {
    const nextLine = objectLines[0];
    if (nextLine && !objectLines.some((line) => line.code === lineCode)) {
      setLineCode(nextLine.code);
      setCapacity(nextLine.baseCapacity);
      setCapacityDraft(normalizeNumericDraft(nextLine.baseCapacity));
    }
  }, [lineCode, objectLines]);

  const work = prikinatorWorks.find((item) => item.id === workId) ?? prikinatorWorks[0];
  const region = prikinatorRegions.find((item) => item.id === regionId) ?? prikinatorRegions[0];
  const result = useMemo(
    () => calculatePrikinatorBuild({ line: selectedLine, capacity, work, region, vatRate }),
    [capacity, region, selectedLine, vatRate, work],
  );
  const quip = quips[Math.abs(Math.round(capacity) + selectedLine.code.length + workId.length + regionId.length) % quips.length];

  return (
    <section className="panel full prikinator">
      <div className="prikinator-hero">
        <div>
          <span className="prikinator-kicker">standalone · НЦС</span>
          <h2>Прикинатор</h2>
          <p>
            Быстрый укрупненный расчет по выбранной строке НЦС: объект, натуральный показатель,
            сценарий работ, региональная поправка и НДС. Все исходные строки показываются рядом с источником.
          </p>
        </div>
        <div className="prikinator-dialog" aria-label="Реплика Прикинатора">
          <strong>Прикинатор</strong>
          <span>{quip}</span>
        </div>
      </div>

      <div className="prikinator-layout">
        <div className="prikinator-left">
          <div className="subsection-title">Что считаем</div>
          <div className="prikinator-choice-grid">
            {prikinatorObjects.map((item) => (
              <button
                key={item.id}
                className={item.id === objectId ? "prikinator-choice active" : "prikinator-choice"}
                onClick={() => setObjectId(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>

          <div className="subsection-title">Что с этим делаем</div>
          <div className="prikinator-choice-grid two">
            {prikinatorWorks.map((item) => (
              <button
                key={item.id}
                className={item.id === workId ? "prikinator-choice active" : "prikinator-choice"}
                onClick={() => setWorkId(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>

          <div className="subsection-title">Строка и показатель</div>
          <div className="form-grid">
            <label className="field">
              <span>Строка НЦС</span>
              <select
                value={selectedLine.code}
                onChange={(event) => {
                  const nextLine = objectLines.find((line) => line.code === event.target.value);
                  setLineCode(event.target.value);
                  if (nextLine) {
                    setCapacity(nextLine.baseCapacity);
                    setCapacityDraft(normalizeNumericDraft(nextLine.baseCapacity));
                  }
                }}
              >
                {objectLines.map((line) => (
                  <option key={line.code} value={line.code}>
                    {lineOptionText(line)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Мощность / натуральный показатель</span>
              <div className="input-affix">
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={capacityDraft}
                  onChange={(event) => {
                    const nextDraft = event.target.value;
                    const parsed = parseNumericDraft(nextDraft);
                    setCapacityDraft(nextDraft);
                    if (parsed !== null) setCapacity(Math.max(0, parsed));
                  }}
                  onBlur={() => setCapacityDraft(normalizeNumericDraft(capacity))}
                />
                <b>{selectedLine.unit}</b>
              </div>
            </label>
            <label className="field">
              <span>Регион / Кпер</span>
              <select value={regionId} onChange={(event) => setRegionId(event.target.value)}>
                {prikinatorRegions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.coefficient} · {item.source}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>НДС</span>
              <div className="input-affix">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={vatRateDraft}
                  onChange={(event) => {
                    const nextDraft = event.target.value;
                    const parsed = parseNumericDraft(nextDraft);
                    setVatRateDraft(nextDraft);
                    if (parsed !== null) setVatRate(Math.max(0, parsed));
                  }}
                  onBlur={() => setVatRateDraft(normalizeNumericDraft(vatRate))}
                />
                <b>{formatNumber(vatRate * 100)}%</b>
              </div>
            </label>
          </div>

          <div className="method-note prikinator-note">
            <b>Кпер</b> здесь означает коэффициент перехода к региональному уровню цены. В демо он задан
            справочно для интерфейса; в рабочем расчете его надо заменить официальным коэффициентом для нужного
            региона, периода и условий. Текущий источник: {region.source}, {region.period}.
          </div>
        </div>

        <aside className="prikinator-right">
          <div className="prikinator-result">
            <span>Итого с НДС</span>
            <strong>{currency.format(result.totalWithVat)}</strong>
            <p>{selectedLine.table}, страница {selectedLine.page}. Цена единицы: {currency.format(result.unitPriceRub)} за {selectedLine.unit}.</p>
          </div>

          <div className="group-summary-table">
            <table>
              <tbody>
                <tr>
                  <td>Показатель НЦС</td>
                  <td>{currency.format(linePriceRub(selectedLine))} / ед.</td>
                </tr>
                <tr>
                  <td>Расчетная цена единицы</td>
                  <td>{currency.format(result.unitPriceRub)}</td>
                </tr>
                <tr>
                  <td>База НЦС</td>
                  <td>{currency.format(result.baseCost)}</td>
                </tr>
                <tr>
                  <td>Сценарий</td>
                  <td>{currency.format(result.scenarioCost)} · k={work.coefficient} · {work.source}</td>
                </tr>
                <tr>
                  <td>Регион</td>
                  <td>{currency.format(result.regionalCost)} · Кпер={region.coefficient} · {region.source}</td>
                </tr>
                <tr>
                  <td>НДС</td>
                  <td>{currency.format(result.vatAmount)}</td>
                </tr>
                <tr className="total-row">
                  <td>Итого</td>
                  <td>{currency.format(result.totalWithVat)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="prikinator-source">
            <strong>{selectedLine.code}</strong>
            <span>{selectedLine.title}</span>
            <small>{selectedLine.sourceName}</small>
            <a href={selectedLine.sourceUrl} target="_blank" rel="noreferrer">
              Открыть PDF источника
            </a>
          </div>

          <div className="method-note prikinator-note compact">
            {result.ncs.note} {work.note} {region.method}
          </div>
        </aside>
      </div>
    </section>
  );
}
