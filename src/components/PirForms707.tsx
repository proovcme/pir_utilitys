import {
  BookOpen,
  Calculator,
  CircleAlert,
  Download,
  FileCheck2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type { SbcResult } from "../domain/types";
import {
  buildPirSummaryRows,
  calculatePirLabor,
  createPirLaborParticipant,
  createPirLaborWork,
  qualificationsForWork,
  workKindLabel,
  type PirEstimatePassport,
  type PirLaborInput,
  type PirLaborWork,
  type PirSummaryExtra,
  type PirWorkKind,
} from "../domain/pirForms";

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

function numericValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PirPassportFields({
  value,
  onChange,
}: {
  value: PirEstimatePassport;
  onChange: (patch: Partial<PirEstimatePassport>) => void;
}) {
  return (
    <details className="pir-passport-editor" open>
      <summary>
        <span>Данные для печатных форм</span>
        <small>Общие для 1П, 2П и 3П</small>
      </summary>
      <div className="pir-passport-grid">
        <label className="field pir-span-2">
          <span>Наименование стройки</span>
          <input value={value.constructionName} onChange={(event) => onChange({ constructionName: event.target.value })} placeholder="Например: Жилой дом по адресу…" />
        </label>
        <label className="field">
          <span>Заказчик</span>
          <input value={value.customer} onChange={(event) => onChange({ customer: event.target.value })} placeholder="Наименование организации" />
        </label>
        <label className="field">
          <span>Проектная организация</span>
          <input value={value.designOrganization} onChange={(event) => onChange({ designOrganization: event.target.value })} placeholder="Наименование организации" />
        </label>
        <label className="field">
          <span>Генеральный проектировщик</span>
          <input value={value.generalDesigner} onChange={(event) => onChange({ generalDesigner: event.target.value })} placeholder="Если отличается" />
        </label>
        <label className="field">
          <span>Уровень цен, год</span>
          <input type="number" min="2000" max="2100" value={value.priceLevelYear || ""} onChange={(event) => onChange({ priceLevelYear: numericValue(event.target.value) })} />
        </label>
        <label className="field">
          <span>Номер сметы 2П</span>
          <input value={value.estimate2pNumber} onChange={(event) => onChange({ estimate2pNumber: event.target.value })} />
        </label>
        <label className="field">
          <span>Номер калькуляции 3П</span>
          <input value={value.estimate3pNumber} onChange={(event) => onChange({ estimate3pNumber: event.target.value })} />
        </label>
      </div>
    </details>
  );
}

function LaborWorkCard({
  work,
  index,
  input,
  onChange,
  onRemove,
}: {
  work: PirLaborWork;
  index: number;
  input: PirLaborInput;
  onChange: (work: PirLaborWork) => void;
  onRemove: () => void;
}) {
  const result = calculatePirLabor({ ...input, works: [work] }).works[0];
  const qualifications = qualificationsForWork(work.kind);

  function changeKind(kind: PirWorkKind) {
    const allowed = qualificationsForWork(kind);
    onChange({
      ...work,
      kind,
      participants: work.participants.map((participant) => ({
        ...participant,
        qualificationId: allowed.some((item) => item.id === participant.qualificationId)
          ? participant.qualificationId
          : allowed[Math.min(allowed.length - 1, 3)].id,
      })),
    });
  }

  return (
    <article className="pir-labor-work">
      <div className="pir-labor-work-heading">
        <div>
          <span className="fgis-kicker">Калькуляция 3П · {index + 1}</span>
          <h4>{work.name || "Новая работа"}</h4>
        </div>
        <div className="pir-work-total">
          <span>Без НДС</span>
          <strong>{money.format(result.costWithoutVat)}</strong>
          <button className="pir-icon-button" onClick={onRemove} aria-label="Удалить работу" title="Удалить работу"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="pir-work-fields">
        <label className="field pir-span-2">
          <span>Наименование проектной работы</span>
          <input value={work.name} onChange={(event) => onChange({ ...work, name: event.target.value })} placeholder="Например: разработка раздела ООС" />
        </label>
        <label className="field">
          <span>Стадия</span>
          <select value={work.stage} onChange={(event) => onChange({ ...work, stage: event.target.value })}>
            <option value="П">Проектная документация (П)</option>
            <option value="Р">Рабочая документация (Р)</option>
            <option value="П+Р">Проектная и рабочая (П+Р)</option>
            <option value="Дополнительные работы">Дополнительные работы</option>
            <option value="Сопутствующие работы">Сопутствующие работы</option>
          </select>
        </label>
        <label className="field">
          <span>Характер работы</span>
          <select value={work.kind} onChange={(event) => changeKind(event.target.value as PirWorkKind)}>
            <option value="ordinary">Обычная документация</option>
            <option value="special">Особо опасный / сложный / уникальный объект</option>
            <option value="bim">Информационная модель</option>
          </select>
          <small className="field-hint">{work.kind === "ordinary" ? "ОКВЭД 71.11, таблица 1.3" : work.kind === "special" ? "ОКВЭД 71.12, таблица 1.3" : "ОКВЭД 71.12, таблица 1.4"}</small>
        </label>
        <label className="field">
          <span>Плановая продолжительность</span>
          <div className="pir-number-affix"><input type="number" min="0" step="1" value={work.plannedDurationDays || ""} onChange={(event) => onChange({ ...work, plannedDurationDays: numericValue(event.target.value) })} /><b>дней</b></div>
          <small className="field-hint">Срок выполнения именно этой работы.</small>
        </label>
        <label className="field pir-span-2">
          <span>Основание трудозатрат</span>
          <input value={work.basis} onChange={(event) => onChange({ ...work, basis: event.target.value })} placeholder="Календарный план, данные аналога, опрос организаций или технологическая карта" />
          <small className="field-hint">Дни и состав команды должны иметь проверяемое основание, а не назначаться произвольно.</small>
        </label>
      </div>

      <div className="pir-labor-table-scroll">
        <table className="pir-labor-table">
          <thead><tr><th>Исполнитель</th><th>Индекс</th><th>Участие, дней</th><th>Количество</th><th>Взвешенные чел.-дни</th><th></th></tr></thead>
          <tbody>
            {result.participants.map((participant) => (
              <tr key={participant.id}>
                <td>
                  <select value={participant.qualificationId} onChange={(event) => onChange({
                    ...work,
                    participants: work.participants.map((item) => item.id === participant.id ? { ...item, qualificationId: event.target.value } : item),
                  })}>
                    {qualifications.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </td>
                <td><b>{number.format(participant.qualification.index)}</b><small>табл. {participant.qualification.table}</small></td>
                <td><input aria-label={`Дни участия: ${participant.qualification.title}`} type="number" min="0" step="1" value={participant.actualDays || ""} onChange={(event) => onChange({
                  ...work,
                  participants: work.participants.map((item) => item.id === participant.id ? { ...item, actualDays: numericValue(event.target.value) } : item),
                })} /></td>
                <td><input aria-label={`Количество исполнителей: ${participant.qualification.title}`} type="number" min="0" step="1" value={participant.headcount || ""} onChange={(event) => onChange({
                  ...work,
                  participants: work.participants.map((item) => item.id === participant.id ? { ...item, headcount: numericValue(event.target.value) } : item),
                })} /></td>
                <td><strong>{number.format(participant.weightedPersonDays)}</strong></td>
                <td><button className="pir-icon-button" onClick={() => onChange({ ...work, participants: work.participants.filter((item) => item.id !== participant.id) })} aria-label="Удалить исполнителя"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th>Итого по работе</th><td>Ккв-уч {number.format(result.qualificationParticipationCoefficient)}</td><td></td><td>{number.format(result.totalHeadcount)} чел.</td><td>{number.format(result.weightedPersonDays)}</td><td></td></tr></tfoot>
        </table>
      </div>
      <div className="pir-work-footer">
        <button className="ghost" onClick={() => onChange({ ...work, participants: [...work.participants, createPirLaborParticipant(work.kind)] })}><Plus size={16} /> Добавить исполнителя</button>
        {result.warnings.length ? <span className="pir-work-warning"><CircleAlert size={15} /> {result.warnings[0]}{result.warnings.length > 1 ? ` Ещё: ${result.warnings.length - 1}.` : ""}</span> : <span className="pir-work-valid"><FileCheck2 size={15} /> Данные для расчёта заполнены</span>}
      </div>
    </article>
  );
}

export function PirLaborCalculator({
  input,
  onChange,
  exporting,
  onExport,
}: {
  input: PirLaborInput;
  onChange: (value: PirLaborInput) => void;
  exporting: boolean;
  onExport: () => void;
}) {
  const result = calculatePirLabor(input);
  const patch = (value: Partial<PirLaborInput>) => onChange({ ...input, ...value });

  return (
    <section className="pir-707-calculator">
      <div className="pir-form-intro">
        <div><span className="fgis-kicker">ФОРМА 3П · ПРИКАЗ № 707/ПР</span><h2>Расчёт стоимости по трудозатратам</h2><p>Для работ, стоимость которых обосновывается составом исполнителей и продолжительностью их участия.</p></div>
        <div className="pir-form-badge"><Users size={20} /><span><b>{number.format(result.totalWeightedPersonDays)}</b> взвешенных чел.-дней</span></div>
      </div>

      <div className="fgis-purpose pir-purpose-compact">
        <BookOpen size={22} />
        <div><h3>Что считает форма 3П</h3><p>Стоимость проектной работы через среднюю дневную выработку и квалификационное участие команды. Это сметная калькуляция по Методике № 707/пр, а не коммерческий расчёт по внутренним окладам вашей организации.</p></div>
      </div>

      <details className="fgis-user-guide" open>
        <summary><span>Как заполнить расчёт</span><small>Четыре шага</small></summary>
        <ol>
          <li><b>Введите официальную среднюю зарплату.</b> Для обычной документации — ОКВЭД 71.11; для особых объектов и информационной модели — 71.12.</li>
          <li><b>Укажите рабочие дни.</b> Среднее за предшествующий год по производственному календарю.</li>
          <li><b>Добавьте работы и исполнителей.</b> Для каждой должности укажите фактические дни участия и количество специалистов.</li>
          <li><b>Запишите основание.</b> Календарный план, аналог, технологическая карта или подтверждённые данные организаций.</li>
        </ol>
      </details>

      <div className="pir-labor-settings">
        <div className="pir-settings-heading"><span className="fgis-step-number">01</span><div><h3>Исходные данные о средней зарплате</h3><p>Берётся не оклад конкретного сотрудника, а средняя начисленная зарплата Росстата за предшествующий год.</p></div></div>
        <div className="pir-settings-grid">
          <label className="field"><span>Год данных</span><input type="number" min="2000" max="2100" value={input.sourceYear || ""} onChange={(event) => patch({ sourceYear: numericValue(event.target.value) })} /></label>
          <label className="field"><span>Рабочих дней в месяце, в среднем</span><input type="number" min="0" step="0.01" value={input.averageWorkingDaysPerMonth || ""} onChange={(event) => patch({ averageWorkingDaysPerMonth: numericValue(event.target.value) })} /></label>
          <label className="field"><span>Средняя зарплата · ОКВЭД 71.11</span><div className="pir-number-affix"><input type="number" min="0" step="100" value={input.ordinaryMonthlySalary || ""} onChange={(event) => patch({ ordinaryMonthlySalary: numericValue(event.target.value) })} /><b>₽/мес.</b></div><small className="field-hint">Архитектурная деятельность.</small></label>
          <label className="field"><span>Средняя зарплата · ОКВЭД 71.12</span><div className="pir-number-affix"><input type="number" min="0" step="100" value={input.specialMonthlySalary || ""} onChange={(event) => patch({ specialMonthlySalary: numericValue(event.target.value) })} /><b>₽/мес.</b></div><small className="field-hint">Инженерно-техническое проектирование.</small></label>
          <label className="field pir-span-2"><span>Источник значения</span><input value={input.salarySource} onChange={(event) => patch({ salarySource: event.target.value })} placeholder="Ссылка, таблица Росстата или реквизиты официальной публикации" /></label>
        </div>
        <div className="pir-fixed-rules">
          <span><b>40%</b> доля зарплаты в себестоимости, Кз = 0,4</span>
          <span><b>10%</b> нормативная рентабельность, Р = 0,1</span>
          <span><b>{number.format(input.vatRate * 100)}%</b> НДС показывается отдельно</span>
        </div>
      </div>

      <div className="pir-labor-list-heading"><div><span className="fgis-step-number">02</span><div><h3>Работы и состав исполнителей</h3><p>Каждая работа формирует отдельную калькуляцию 3П и отдельную строку в сводной форме 1П.</p></div></div><button className="primary" onClick={() => patch({ works: [...input.works, createPirLaborWork()] })}><Plus size={17} /> Добавить работу</button></div>
      <div className="pir-labor-list">
        {input.works.map((work, index) => <LaborWorkCard key={work.id} work={work} index={index} input={input} onChange={(next) => patch({ works: input.works.map((item) => item.id === work.id ? next : item) })} onRemove={() => patch({ works: input.works.filter((item) => item.id !== work.id) })} />)}
        {!input.works.length ? <div className="pir-empty-list"><Users size={26} /><b>Работы ещё не добавлены</b><span>Добавьте работу, затем укажите исполнителей и дни участия.</span></div> : null}
      </div>

      {result.warnings.length ? <div className="pir-common-warning"><CircleAlert size={17} /><span>{result.warnings.join(" ")}</span></div> : null}
      <section className="pir-form-result">
        <div><span className="fgis-kicker">ИТОГ ФОРМЫ 3П</span><h3>{money.format(result.totalWithVat)}</h3><p>{money.format(result.totalWithoutVat)} без НДС · НДС {money.format(result.vatAmount)}</p></div>
        <div className="pir-result-formula"><Calculator size={18} /><span><b>Формула:</b> средняя дневная выработка × плановый срок × численность × Ккв-уч. В расчёте это равно средней дневной выработке × взвешенные человеко-дни.</span></div>
        <button className="primary fgis-export" disabled={exporting || result.totalWithoutVat <= 0} onClick={onExport}><Download size={17} /> {exporting ? "Готовим XLSX…" : "Скачать форму 3П"}</button>
      </section>
    </section>
  );
}

export function PirSummary({
  passport,
  form2pResult,
  form2pName,
  laborInput,
  extras,
  onExtrasChange,
  exporting,
  onExport,
}: {
  passport: PirEstimatePassport;
  form2pResult: SbcResult;
  form2pName: string;
  laborInput: PirLaborInput;
  extras: PirSummaryExtra[];
  onExtrasChange: (value: PirSummaryExtra[]) => void;
  exporting: boolean;
  onExport: () => void;
}) {
  const laborResult = calculatePirLabor(laborInput);
  const rows = buildPirSummaryRows(passport, form2pName, form2pResult.currentPriceWithoutVat, laborResult, extras, laborInput.vatRate);
  const totalWithoutVat = rows.reduce((sum, item) => sum + item.costWithoutVat, 0);
  const vatAmount = rows.reduce((sum, item) => sum + item.vatAmount, 0);

  return (
    <section className="pir-707-calculator">
      <div className="pir-form-intro">
        <div><span className="fgis-kicker">ФОРМА 1П · СВОДНАЯ СМЕТА</span><h2>Общая стоимость проектных работ</h2><p>Собирает рассчитанные документы 2П и 3П в один итог по стройке.</p></div>
        <div className="pir-form-badge"><FileCheck2 size={20} /><span><b>{rows.length}</b> {rows.length % 10 === 1 && rows.length % 100 !== 11 ? "позиция" : rows.length % 10 >= 2 && rows.length % 10 <= 4 && (rows.length % 100 < 10 || rows.length % 100 >= 20) ? "позиции" : "позиций"} в сводной смете</span></div>
      </div>
      <div className="fgis-purpose pir-purpose-compact"><BookOpen size={22} /><div><h3>Форма 1П ничего не пересчитывает повторно</h3><p>Она берёт готовую стоимость нормативной сметы 2П и каждой калькуляции 3П. Дополнительную внешнюю смету можно внести отдельной строкой с обязательной ссылкой на документ.</p></div></div>

      <div className="pir-summary-table-scroll">
        <table className="pir-summary-table">
          <thead><tr><th>№</th><th>Работы</th><th>Характеристика</th><th>Ссылка на смету</th><th>Без НДС</th><th>НДС</th><th>С НДС</th><th></th></tr></thead>
          <tbody>
            {rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><th>{row.name}<small>{row.source === "2p" ? "автоматически из 2П" : row.source === "3p" ? "автоматически из 3П" : "добавлено вручную"}</small></th><td>{row.characteristic}</td><td>{row.reference}</td><td>{money.format(row.costWithoutVat)}</td><td>{money.format(row.vatAmount)}</td><td><b>{money.format(row.costWithVat)}</b></td><td>{row.source === "manual" ? <button className="pir-icon-button" onClick={() => onExtrasChange(extras.filter((item) => item.id !== row.id))} aria-label="Удалить строку"><Trash2 size={15} /></button> : null}</td></tr>)}
            {!rows.length ? <tr><td colSpan={8}><div className="pir-empty-list"><FileCheck2 size={26} /><b>Сводная смета пока пуста</b><span>Выполните расчёт в форме 2П или 3П.</span></div></td></tr> : null}
          </tbody>
          <tfoot><tr><th colSpan={4}>Итого по сводной смете</th><td>{money.format(totalWithoutVat)}</td><td>{money.format(vatAmount)}</td><td>{money.format(totalWithoutVat + vatAmount)}</td><td></td></tr></tfoot>
        </table>
      </div>

      <details className="pir-manual-estimate">
        <summary><Plus size={16} /> Добавить внешнюю смету или расчёт</summary>
        <div className="pir-manual-list">
          {extras.map((item) => <div className="pir-manual-row" key={item.id}>
            <label className="field"><span>Работы</span><input value={item.name} onChange={(event) => onExtrasChange(extras.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} /></label>
            <label className="field"><span>Характеристика</span><input value={item.characteristic} onChange={(event) => onExtrasChange(extras.map((row) => row.id === item.id ? { ...row, characteristic: event.target.value } : row))} /></label>
            <label className="field"><span>Ссылка на документ</span><input value={item.reference} onChange={(event) => onExtrasChange(extras.map((row) => row.id === item.id ? { ...row, reference: event.target.value } : row))} /></label>
            <label className="field"><span>Стоимость без НДС</span><input type="number" min="0" value={item.costWithoutVat || ""} onChange={(event) => onExtrasChange(extras.map((row) => row.id === item.id ? { ...row, costWithoutVat: numericValue(event.target.value) } : row))} /></label>
          </div>)}
          <button className="ghost" onClick={() => onExtrasChange([...extras, { id: crypto.randomUUID(), name: "", characteristic: "", reference: "", costWithoutVat: 0 }])}><Plus size={16} /> Добавить строку</button>
        </div>
      </details>

      <section className="pir-form-result">
        <div><span className="fgis-kicker">ИТОГО ФОРМЫ 1П</span><h3>{money.format(totalWithoutVat + vatAmount)}</h3><p>{money.format(totalWithoutVat)} без НДС · НДС {money.format(vatAmount)}</p></div>
        <div className="pir-result-formula"><FileCheck2 size={18} /><span>Сумма связана с текущими расчётами 2П и 3П. При их изменении сводная смета обновляется автоматически.</span></div>
        <button className="primary fgis-export" disabled={exporting || rows.length === 0} onClick={onExport}><Download size={17} /> {exporting ? "Готовим XLSX…" : "Скачать форму 1П"}</button>
      </section>
    </section>
  );
}
