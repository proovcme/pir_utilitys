import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { CalculationSnapshot, ExportOptions } from "../domain/types";
import {
  getLineStaffing,
  getRateGroupCode,
  getStaffRoleMultiplier,
  rateDisciplineDefinitions,
  resolveCostGroup,
} from "../domain/calculation";
import { explainFgisIndicator } from "../domain/fgisPir";

const rub = '#,##0" ₽"';
const percent = "0%";
const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;
const formula = (formulaText: string, result?: number | string) => ({ formula: formulaText, result });

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

function buildExportRates(snapshot: CalculationSnapshot) {
  const sourceRates = new Map(snapshot.catalog.rates.map((rate) => [rate.code, rate]));
  const groupedRates = rateDisciplineDefinitions.map((definition) => {
    const values = definition.codes
      .map((code) => sourceRates.get(code)?.monthlySalaryMedian ?? 0)
      .filter((value) => value > 0);
    return {
      code: definition.code,
      group: definition.description,
      monthlySalaryMedian: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      comment: definition.codes.join(", "),
    };
  });
  const groupedCodes = new Set(rateDisciplineDefinitions.flatMap((definition) => [definition.code, ...definition.codes]));
  const customRates = snapshot.catalog.rates.filter((rate) => !groupedCodes.has(rate.code));
  return [...groupedRates, ...customRates];
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA72525" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD7DEE8" } } };
  });
}

function styleTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 16, color: { argb: "FF172033" } };
}

function setColumns(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

export async function exportEstimateWorkbook(
  snapshot: CalculationSnapshot,
  options: ExportOptions,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const exportRates = buildExportRates(snapshot);
  const pdStage = snapshot.result.groupBreakdown.find((group) => group.group === "ПД");
  const rdStage = snapshot.result.groupBreakdown.find((group) => group.group === "РД");
  const hasPdAndRd = Boolean(pdStage && rdStage);
  const pdAndRdTotal = (pdStage?.totalWithoutVat ?? 0) + (rdStage?.totalWithoutVat ?? 0);
  const pdPaymentShare = hasPdAndRd && pdAndRdTotal > 0 ? (pdStage?.totalWithoutVat ?? 0) / pdAndRdTotal : 0.5;
  workbook.creator = "Калькулятор оценки проекта";
  workbook.created = new Date(snapshot.createdAt);
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet("Итог", {
    views: [{ showGridLines: false }],
  });
  const estimate = workbook.addWorksheet("Оценка", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 8 }],
  });
  const constructor = workbook.addWorksheet("Конструктор", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 1 }],
  });
  const refs = workbook.addWorksheet("Справочники", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 1 }],
  });
  const sbc = workbook.addWorksheet("СБЦ ФГИС", {
    views: [{ showGridLines: false }],
  });
  const sbcBreakdown = workbook.addWorksheet("Разделы ФГИС", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 4 }],
  });

  summary.getCell("A1").value = "Итоговая сводка";
  styleTitle(summary.getCell("A1"));
  summary.mergeCells("A1:H1");
  summary.getCell("A2").value = "Тип проекта";
  summary.getCell("B2").value = snapshot.project.projectType ?? "";
  summary.getCell("D2").value = "Адрес";
  summary.getCell("E2").value = snapshot.project.address ?? "";
  summary.getCell("G2").value = "Заказчик";
  summary.getCell("H2").value = snapshot.project.customer ?? "";
  summary.getRow(3).values = [
    "Показатель",
    "Значение",
    "",
    "Группа затрат",
    "Себестоимость",
    "Цена без НДС",
    "руб./м²",
    "Доля",
    "Прибыль",
    "% прибыли",
  ];
  styleHeader(summary.getRow(3));
  const summaryRows = [
    ["Активных строк", formula(`${quoteSheet("Пульт")}!B16`, snapshot.result.totals.activeRows)],
    ["Человекодни", formula(`${quoteSheet("Пульт")}!B28`, snapshot.result.totals.personDays)],
    ["Себестоимость ФОТ с НДФЛ", formula(`${quoteSheet("Пульт")}!B17`, snapshot.result.totals.directWorks)],
    ["Буфер, руб.", formula(`${quoteSheet("Пульт")}!B18`, snapshot.result.totals.bufferAmount)],
    ["Итого с буфером, руб.", formula(`${quoteSheet("Пульт")}!B19`, snapshot.result.totals.totalWithBuffer)],
    ["Накладные расходы, руб.", formula(`${quoteSheet("Пульт")}!B27`, snapshot.result.totals.overheadAmount)],
    ["Прибыль / убыток, руб.", formula(`${quoteSheet("Пульт")}!B20`, snapshot.result.totals.commercialMarkup)],
    ["Итого без НДС, руб.", formula(`${quoteSheet("Пульт")}!B21`, snapshot.result.totals.totalWithoutVat)],
    ["НДС, руб.", formula(`${quoteSheet("Пульт")}!B22`, snapshot.result.totals.vatAmount)],
    ["Итого с НДС, руб.", formula(`${quoteSheet("Пульт")}!B23`, snapshot.result.totals.totalWithVat)],
    ["Стоимость без НДС, руб./м²", formula(`${quoteSheet("Пульт")}!B24`, snapshot.result.totals.costWithoutVatPerSquareMeter)],
    ["Стоимость с НДС, руб./м²", formula(`${quoteSheet("Пульт")}!B25`, snapshot.result.totals.costWithVatPerSquareMeter)],
    ["Аванс, руб.", formula(`${quoteSheet("Пульт")}!E21`, snapshot.result.finance.advanceAmount)],
    ["Остаток оплаты, руб.", formula(`${quoteSheet("Пульт")}!E22`, snapshot.result.finance.remainingAmount)],
    ["Сумма банковской гарантии, руб.", formula(`${quoteSheet("Пульт")}!E23`, snapshot.result.finance.bankGuaranteeAmount)],
    ["Комиссия БГ, руб.", formula(`${quoteSheet("Пульт")}!E25`, snapshot.result.finance.bankGuaranteeCost)],
  ];
  const rowCount = Math.max(summaryRows.length, snapshot.result.groupBreakdown.length + 1);
  for (let index = 0; index < rowCount; index += 1) {
    const rowNumber = index + 4;
    const metric = summaryRows[index];
    const group = snapshot.result.groupBreakdown[index];
    const groupCells = group
      ? [
        group.group,
        formula(`SUMIFS(${quoteSheet("Конструктор")}!$AA:$AA,${quoteSheet("Конструктор")}!$R:$R,1,${quoteSheet("Конструктор")}!$AH:$AH,D${rowNumber})`, group.directWorks),
        formula(`IFERROR(E${rowNumber}/${quoteSheet("Пульт")}!$B$17*${quoteSheet("Пульт")}!$B$21,0)`, group.totalWithoutVat),
        formula(`IFERROR(F${rowNumber}/${quoteSheet("Пульт")}!$B$4,0)`, group.costPerSquareMeter),
        formula(`IFERROR(E${rowNumber}/${quoteSheet("Пульт")}!$B$17,0)`, group.share),
        formula(`${quoteSheet("Пульт")}!$B$20*H${rowNumber}`, group.profit),
        formula(`IFERROR(I${rowNumber}/E${rowNumber},0)`, group.profitRate),
      ]
      : index === snapshot.result.groupBreakdown.length
        ? [
          "Итого",
          formula(`SUM(E4:E${rowNumber - 1})`, snapshot.result.totals.directWorks),
          formula(`SUM(F4:F${rowNumber - 1})`, snapshot.result.totals.totalWithoutVat),
          formula(`IFERROR(F${rowNumber}/${quoteSheet("Пульт")}!$B$4,0)`, snapshot.result.totals.costWithoutVatPerSquareMeter),
          formula(`SUM(H4:H${rowNumber - 1})`, snapshot.result.totals.directWorks > 0 ? 1 : 0),
          formula(`SUM(I4:I${rowNumber - 1})`, snapshot.result.totals.commercialMarkup),
          formula(`IFERROR(I${rowNumber}/E${rowNumber},0)`, snapshot.result.totals.directWorks > 0 ? snapshot.result.totals.commercialMarkup / snapshot.result.totals.directWorks : 0),
        ]
        : ["", "", "", "", "", "", ""];
    summary.addRow([metric?.[0] ?? "", metric?.[1] ?? "", "", ...groupCells]);
  }
  setColumns(summary, [34, 18, 4, 18, 18, 18, 14, 10, 18, 12]);
  summary.getColumn(2).numFmt = rub;
  summary.getColumn(5).numFmt = rub;
  summary.getColumn(6).numFmt = rub;
  summary.getColumn(7).numFmt = '#,##0.00" ₽/м²"';
  summary.getColumn(8).numFmt = percent;
  summary.getColumn(9).numFmt = rub;
  summary.getColumn(10).numFmt = percent;
  summary.getCell("B4").numFmt = "#,##0";
  summary.getCell("B5").numFmt = "#,##0.00";
  summary.getCell("B14").numFmt = '#,##0.00" ₽/м²"';
  summary.getCell("B15").numFmt = '#,##0.00" ₽/м²"';

  const cashFlowHeaderRow = rowCount + 7;
  summary.getCell(`A${cashFlowHeaderRow - 2}`).value = "ДДС";
  styleTitle(summary.getCell(`A${cashFlowHeaderRow - 2}`));
  summary.getRow(cashFlowHeaderRow).values = ["Месяц", "Поступления", "Расходы", "БГ", "ДДС", "Накопительно"];
  styleHeader(summary.getRow(cashFlowHeaderRow));
  snapshot.result.finance.cashFlow.forEach((row, index) => {
    const rowNumber = cashFlowHeaderRow + index + 1;
    const monthNumber = index + 1;
    summary.getRow(rowNumber).values = [
      row.month,
      formula(`IF(${monthNumber}=1,${quoteSheet("Пульт")}!$E$21,0)+IF(${quoteSheet("Пульт")}!$E$29=1,IF(${monthNumber}=${quoteSheet("Пульт")}!$E$27,${quoteSheet("Пульт")}!$E$22*${quoteSheet("Пульт")}!$E$26,0)+IF(${monthNumber}=${quoteSheet("Пульт")}!$E$20,${quoteSheet("Пульт")}!$E$22*(1-${quoteSheet("Пульт")}!$E$26),0),IF(${monthNumber}=${quoteSheet("Пульт")}!$E$20,${quoteSheet("Пульт")}!$E$22,0))`, row.revenue),
      formula(`${quoteSheet("Пульт")}!$E$28`, row.cost),
      formula(index === 0 ? `${quoteSheet("Пульт")}!$E$25` : "0", row.bankGuaranteeCost),
      formula(`B${rowNumber}-C${rowNumber}-D${rowNumber}`, row.netCashFlow),
      formula(index === 0 ? `E${rowNumber}` : `F${rowNumber - 1}+E${rowNumber}`, row.cumulativeCashFlow),
    ];
  });
  [2, 3, 4, 5, 6].forEach((column) => {
    summary.getColumn(column).numFmt = rub;
  });

  const control = workbook.addWorksheet("Пульт", {
    views: [{ showGridLines: false }],
    state: options.includeAuditSheets ? "visible" : "hidden",
  });
  control.getCell("A1").value = "Калькулятор оценки ПИР / РД";
  styleTitle(control.getCell("A1"));
  control.getRow(3).values = ["Вводные параметры", "Значение"];
  styleHeader(control.getRow(3));
  control.getCell("D3").value = "Глобальные настройки";
  control.getCell("E3").value = "Значение";
  styleHeader(control.getRow(3));
  const inputRows = [
    ["Площадь объекта, м²", snapshot.project.area],
    ["НДС", snapshot.project.vatRate],
    ["Общий коммерческий коэффициент", snapshot.project.commercialCoefficient],
    ["Буфер", snapshot.project.bufferRate],
    ["Включать общие для всех", snapshot.project.includeCommon ? 1 : 0],
    ["ПД ОКС полный", snapshot.project.presetPdOks ? 1 : 0],
    ["ПД линейный полный", snapshot.project.presetPdLinear ? 1 : 0],
    ["РД полный", snapshot.project.presetRdFull ? 1 : 0],
    ["РД ядро общественного здания", snapshot.project.presetRdCore ? 1 : 0],
    ["РД часто для общественного здания", snapshot.project.presetRdFrequent ? 1 : 0],
    ["Общий множитель ставок", snapshot.project.rateMultiplier],
  ];
  control.addRows(inputRows);
  control.getCell("D4").value = "Единый коэффициент строк";
  control.getCell("E4").value = snapshot.project.useGlobalCoefficient ? 1 : 0;
  control.getCell("D5").value = "Коэффициент строк";
  control.getCell("E5").value = snapshot.project.globalCoefficient;
  control.getCell("D6").value = "Единый срок строк";
  control.getCell("E6").value = snapshot.project.useGlobalDuration ? 1 : 0;
  control.getCell("D7").value = "Срок строк, дн.";
  control.getCell("E7").value = snapshot.project.globalDurationDays;
  control.getCell("D9").value = "Стоимость ПК инженера";
  control.getCell("E9").value = snapshot.project.computerCost;
  control.getCell("D10").value = "Ликвидационная стоимость";
  control.getCell("E10").value = snapshot.project.computerSalvageValue;
  control.getCell("D11").value = "СПИ, лет";
  control.getCell("E11").value = snapshot.project.computerUsefulLifeYears;
  control.getCell("D12").value = "Амортизация в месяц";
  control.getCell("E12").value = formula("IFERROR(MAX(0,E9-E10)/E11/12,0)", snapshot.project.computerUsefulLifeYears > 0 ? Math.max(0, snapshot.project.computerCost - snapshot.project.computerSalvageValue) / snapshot.project.computerUsefulLifeYears / 12 : 0);
  control.getCell("D14").value = "Накладные расходы";
  control.getCell("E14").value = snapshot.project.overheadRate;
  control.getCell("D15").value = "Шаг роли";
  control.getCell("E15").value = snapshot.project.roleStepRate ?? 0.15;
  control.getCell("D13").value = "Страховые взносы";
  control.getCell("E13").value = snapshot.project.insuranceContributionRate;
  control.getRow(15).values = ["Итоговые показатели", "Формула"];
  styleHeader(control.getRow(15));
  control.getCell("B16").value = formula(`COUNTIF(${quoteSheet("Конструктор")}!R2:R${snapshot.catalog.lines.length + 1},1)`, snapshot.result.totals.activeRows);
  control.getCell("B17").value = formula(`SUMIFS(${quoteSheet("Конструктор")}!AA2:AA${snapshot.catalog.lines.length + 1},${quoteSheet("Конструктор")}!R2:R${snapshot.catalog.lines.length + 1},1)`, snapshot.result.totals.directWorks);
  control.getCell("B18").value = formula("B17*$B$7", snapshot.result.totals.bufferAmount);
  control.getCell("B19").value = formula("B17+B18", snapshot.result.totals.totalWithBuffer);
  control.getCell("B20").value = formula("B19*$B$6-(B19+B27)", snapshot.result.totals.commercialMarkup);
  control.getCell("B21").value = formula("B19*$B$6", snapshot.result.totals.totalWithoutVat);
  control.getCell("B22").value = formula("B21*$B$5", snapshot.result.totals.vatAmount);
  control.getCell("B23").value = formula("B21+B22", snapshot.result.totals.totalWithVat);
  control.getCell("B24").value = formula("IFERROR(B21/$B$4,0)", snapshot.result.totals.costWithoutVatPerSquareMeter);
  control.getCell("B25").value = formula("IFERROR(B23/$B$4,0)", snapshot.result.totals.costWithVatPerSquareMeter);
  control.getCell("B26").value = formula(`SUMPRODUCT((${quoteSheet("Конструктор")}!R2:R${snapshot.catalog.lines.length + 1}=1)*(${quoteSheet("Конструктор")}!AF2:AF${snapshot.catalog.lines.length + 1}<>""))`, snapshot.result.totals.warningCount);
  control.getCell("B27").value = formula("B19*$E$14", snapshot.result.totals.overheadAmount);
  control.getCell("B28").value = formula(`SUMPRODUCT((${quoteSheet("Конструктор")}!R2:R${snapshot.catalog.lines.length + 1}=1)*(${quoteSheet("Конструктор")}!H2:H${snapshot.catalog.lines.length + 1}="ФОТ")*${quoteSheet("Конструктор")}!V2:V${snapshot.catalog.lines.length + 1}*(${quoteSheet("Конструктор")}!S2:S${snapshot.catalog.lines.length + 1}+${quoteSheet("Конструктор")}!T2:T${snapshot.catalog.lines.length + 1}+${quoteSheet("Конструктор")}!U2:U${snapshot.catalog.lines.length + 1}))`, snapshot.result.totals.personDays);
  control.getCell("D17").value = "Авансирование";
  control.getCell("E17").value = snapshot.project.advanceRate;
  control.getCell("D18").value = "Начало работ";
  control.getCell("E18").value = snapshot.project.workStartMonth;
  control.getCell("D19").value = "Окончание работ";
  control.getCell("E19").value = snapshot.project.workEndMonth;
  control.getCell("D20").value = "Месяцев работ";
  control.getCell("E20").value = snapshot.result.finance.workMonths;
  control.getCell("D21").value = "Сумма аванса";
  control.getCell("E21").value = formula("B23*E17", snapshot.result.finance.advanceAmount);
  control.getCell("D22").value = "Остаток оплаты";
  control.getCell("E22").value = formula("B23-E21", snapshot.result.finance.remainingAmount);
  control.getCell("D23").value = "Сумма БГ";
  control.getCell("E23").value = formula("E21", snapshot.result.finance.bankGuaranteeAmount);
  control.getCell("D24").value = "Ставка БГ годовая";
  control.getCell("E24").value = snapshot.project.bankGuaranteeAnnualRate;
  control.getCell("D25").value = "Комиссия БГ";
  control.getCell("E25").value = formula("E23*E24*E20/12", snapshot.result.finance.bankGuaranteeCost);
  control.getCell("D26").value = "Доля оплаты после ПД";
  control.getCell("E26").value = pdPaymentShare;
  control.getCell("D27").value = "Месяц оплаты после ПД";
  control.getCell("E27").value = formula("MAX(1,ROUNDUP(E20/2,0))", Math.max(1, Math.ceil(snapshot.result.finance.workMonths / 2)));
  control.getCell("D28").value = "Ежемесячные расходы";
  control.getCell("E28").value = formula("IFERROR((B19+B27)/E20,0)", snapshot.result.finance.workMonths > 0 ? snapshot.result.totals.totalWithOverhead / snapshot.result.finance.workMonths : 0);
  control.getCell("D29").value = "Оплата по ПД и РД";
  control.getCell("E29").value = hasPdAndRd ? 1 : 0;
  ["A16", "A17", "A18", "A19", "A20", "A21", "A22", "A23", "A24", "A25", "A26", "A27", "A28"].forEach((address, i) => {
    control.getCell(address).value = [
      "Активных строк",
      "Прямые работы, руб.",
      "Буфер, руб.",
      "Итого с буфером, руб.",
      "Прибыль / убыток, руб.",
      "Итого без НДС, руб.",
      "НДС, руб.",
      "Итого с НДС, руб.",
      "Стоимость без НДС, руб./м²",
      "Стоимость с НДС, руб./м²",
      "Строк без суммы/ставки",
      "Накладные расходы, руб.",
      "Человекодни",
    ][i];
  });
  setColumns(control, [34, 18, 4, 28, 18]);
  control.getColumn(2).numFmt = rub;
  control.getColumn(5).numFmt = rub;
  control.getCell("B5").numFmt = percent;
  control.getCell("B7").numFmt = percent;
  control.getCell("E17").numFmt = percent;
  control.getCell("E24").numFmt = percent;
  control.getCell("E26").numFmt = percent;

  constructor.getRow(1).values = [
    "ID",
    "Источник",
    "Категория / набор",
    "Раздел / марка",
    "Наименование",
    "Исполнитель",
    "Код отд.",
    "Тип расчета",
    "ПД ОКС",
    "ПД линейный",
    "РД полный",
    "РД ядро",
    "РД часто",
    "Общие",
    "В выбранном наборе",
    "Добавить вручную",
    "Исключить",
    "Учитывать",
    "Главспец",
    "Ведущий",
    "Инженер",
    "Срок, дн.",
    "Медиана ФОТ, руб./мес",
    "Ручной ввод / %, руб.",
    "ФОТ-оценка, руб.",
    "Коэф.",
    "Стоимость работ, руб.",
    "Комментарий",
    "С буфером, руб.",
    "С коммерч. коэф., руб.",
    "Стоимость, руб./м²",
    "Контроль",
    "Порядок",
    "Группа затрат",
  ];
  styleHeader(constructor.getRow(1));
  snapshot.catalog.lines.forEach((line, index) => {
    const row = index + 2;
    const staffing = getLineStaffing(line);
    const lineGroupCode = getRateGroupCode(line.departmentCode) ?? line.departmentCode;
    const totalUnits = staffing.chief + staffing.lead + staffing.engineer;
    const roleMultiplier = totalUnits > 0
      ? (
        staffing.chief * getStaffRoleMultiplier("Главспец", snapshot.project.roleStepRate ?? 0.15) +
        staffing.lead +
        staffing.engineer * getStaffRoleMultiplier("Инженер", snapshot.project.roleStepRate ?? 0.15)
      ) / totalUnits
      : getStaffRoleMultiplier(line.staffRole, snapshot.project.roleStepRate ?? 0.15);
    constructor.getRow(row).values = [
      line.id,
      line.source,
      line.category,
      line.section,
      line.name,
      line.performer,
      lineGroupCode,
      line.calculationType,
      line.presetPdOks ? 1 : 0,
      line.presetPdLinear ? 1 : 0,
      line.presetRdFull ? 1 : 0,
      line.presetRdCore ? 1 : 0,
      line.presetRdFrequent ? 1 : 0,
      line.common ? 1 : 0,
      formula(`IF(OR(AND($I${row}=1,${quoteSheet("Пульт")}!$B$9=1),AND($J${row}=1,${quoteSheet("Пульт")}!$B$10=1),AND($K${row}=1,${quoteSheet("Пульт")}!$B$11=1),AND($L${row}=1,${quoteSheet("Пульт")}!$B$12=1),AND($M${row}=1,${quoteSheet("Пульт")}!$B$13=1),AND($N${row}=1,${quoteSheet("Пульт")}!$B$8=1)),1,0)`),
      line.manualInclude ? 1 : 0,
      line.excluded ? 1 : 0,
      formula(`IF($H${row}="Заголовок",0,IF($Q${row}=1,0,MAX($O${row},$P${row})))`),
      staffing.chief,
      staffing.lead,
      staffing.engineer,
      formula(`IF(${quoteSheet("Пульт")}!$E$6=1,${quoteSheet("Пульт")}!$E$7,${line.durationDays})`),
      formula(`IFERROR(VLOOKUP($G${row},${quoteSheet("Справочники")}!$A:$C,3,FALSE)*${quoteSheet("Пульт")}!$B$14*${roleMultiplier}+IF($H${row}="ФОТ",${quoteSheet("Пульт")}!$E$12,0),0)`),
      line.manualAmount,
      formula(`IF($R${row}=1,($S${row}+$T${row}+$U${row})*$V${row}/30*$W${row},0)`),
      formula(`IF(${quoteSheet("Пульт")}!$E$4=1,${quoteSheet("Пульт")}!$E$5,${line.coefficient})`),
      formula(`IF($R${row}=1,IF(OR($H${row}="Ручной",$H${row}="Ручная сумма",$H${row}="Подряд"),$X${row},IF($H${row}="% от общего",$X${row}/100*SUMIFS($AA:$AA,$R:$R,1,$H:$H,"<>% от общего"),$Y${row}*$Z${row})),0)`),
      line.comment,
      formula(`IF($R${row}=1,$AA${row}*(1+${quoteSheet("Пульт")}!$B$7),0)`),
      formula(`IF($R${row}=1,$AC${row}*${quoteSheet("Пульт")}!$B$6,0)`),
      formula(`IFERROR($AD${row}/${quoteSheet("Пульт")}!$B$4,0)`),
      formula(`IF(AND($R${row}=1,$H${row}="ФОТ",$W${row}=0),"Нет ставки","")`),
      formula(`IF($R${row}=1,COUNTIF($R$2:$R${row},1),"")`),
      resolveCostGroup(line),
    ];
  });
  setColumns(constructor, [16, 12, 20, 16, 42, 14, 12, 16, 9, 11, 10, 10, 10, 8, 10, 12, 10, 10, 10, 10, 10, 10, 16, 15, 15, 8, 16, 28, 16, 18, 16, 18, 10, 14]);
  constructor.getColumn(23).numFmt = rub;
  constructor.getColumn(24).numFmt = rub;
  constructor.getColumn(25).numFmt = rub;
  constructor.getColumn(27).numFmt = rub;
  constructor.getColumn(29).numFmt = rub;
  constructor.getColumn(30).numFmt = rub;
  constructor.getColumn(31).numFmt = '#,##0.00" ₽/м²"';
  constructor.autoFilter = { from: "A1", to: `AH${snapshot.catalog.lines.length + 1}` };

  estimate.getCell("A1").value = "Чистовая оценка: активные строки";
  styleTitle(estimate.getCell("A1"));
  estimate.mergeCells("A1:R1");
  estimate.getRow(3).values = [
    "Площадь, м²",
    formula(`${quoteSheet("Пульт")}!$B$4`, snapshot.project.area),
    "",
    "Буфер",
    formula(`${quoteSheet("Пульт")}!$B$7`, snapshot.project.bufferRate),
    "",
    "Коммерческий коэффициент",
    formula(`${quoteSheet("Пульт")}!$B$6`, snapshot.project.commercialCoefficient),
  ];
  estimate.getRow(4).values = [
    "Итого без НДС",
    formula(`${quoteSheet("Пульт")}!$B$21`, snapshot.result.totals.totalWithoutVat),
    "",
    "НДС",
    formula(`${quoteSheet("Пульт")}!$B$22`, snapshot.result.totals.vatAmount),
    "",
    "Итого с НДС",
    formula(`${quoteSheet("Пульт")}!$B$23`, snapshot.result.totals.totalWithVat),
  ];
  estimate.getRow(5).values = [
    "Стоимость без НДС, руб./м²",
    formula(`${quoteSheet("Пульт")}!$B$24`, snapshot.result.totals.costWithoutVatPerSquareMeter),
    "",
    "Стоимость с НДС, руб./м²",
    formula(`${quoteSheet("Пульт")}!$B$25`, snapshot.result.totals.costWithVatPerSquareMeter),
    "",
    "Активных строк",
    formula(`${quoteSheet("Пульт")}!$B$16`, snapshot.result.totals.activeRows),
  ];
  estimate.getRow(8).values = [
    "№",
    "ID",
    "Источник",
    "Раздел / марка",
    "Наименование",
    "Исполнитель",
    "Код отд.",
    "ш.е.",
    "Срок, дн.",
    "Медиана ФОТ",
    "ФОТ-оценка",
    "Коэф.",
    "Ручной ввод / %",
    "Стоимость работ",
    "С буфером",
    "С коммерч. коэф.",
    "руб./м²",
    "Комментарий",
  ];
  styleHeader(estimate.getRow(8));
  snapshot.result.activeLines.forEach((line, index) => {
    const row = index + 9;
    const constructorRow = snapshot.catalog.lines.findIndex((item) => item.id === line.id) + 2;
    estimate.getRow(row).values = [
      formula(`${quoteSheet("Конструктор")}!$AG${constructorRow}`, index + 1),
      formula(`${quoteSheet("Конструктор")}!$A${constructorRow}`, line.id),
      formula(`${quoteSheet("Конструктор")}!$B${constructorRow}`, line.source ?? ""),
      formula(`${quoteSheet("Конструктор")}!$D${constructorRow}`, line.section ?? ""),
      formula(`${quoteSheet("Конструктор")}!$E${constructorRow}`, line.name ?? ""),
      formula(`${quoteSheet("Конструктор")}!$F${constructorRow}`, line.performer ?? ""),
      formula(`${quoteSheet("Конструктор")}!$G${constructorRow}`, line.departmentCode ?? ""),
      formula(`SUM(${quoteSheet("Конструктор")}!$S${constructorRow}:$U${constructorRow})`, line.workUnits),
      formula(`${quoteSheet("Конструктор")}!$V${constructorRow}`, line.durationDays),
      formula(`${quoteSheet("Конструктор")}!$W${constructorRow}`, line.monthlySalaryMedian),
      formula(`${quoteSheet("Конструктор")}!$Y${constructorRow}`, line.fotEstimate),
      formula(`${quoteSheet("Конструктор")}!$Z${constructorRow}`, line.coefficient),
      formula(`${quoteSheet("Конструктор")}!$X${constructorRow}`, line.manualAmount),
      formula(`${quoteSheet("Конструктор")}!$AA${constructorRow}`, line.workCost),
      formula(`${quoteSheet("Конструктор")}!$AC${constructorRow}`, line.withBuffer),
      formula(`${quoteSheet("Конструктор")}!$AD${constructorRow}`, line.withCommercialCoefficient),
      formula(`${quoteSheet("Конструктор")}!$AE${constructorRow}`, line.costPerSquareMeter),
      formula(`${quoteSheet("Конструктор")}!$AB${constructorRow}`, line.comment ?? ""),
    ];
  });
  setColumns(estimate, [6, 16, 12, 16, 42, 14, 12, 8, 10, 15, 15, 8, 15, 16, 16, 18, 14, 28]);
  [10, 11, 13, 14, 15, 16].forEach((column) => {
    estimate.getColumn(column).numFmt = rub;
  });
  estimate.getColumn(17).numFmt = '#,##0.00" ₽/м²"';
  estimate.autoFilter = { from: "A8", to: `R${Math.max(9, snapshot.result.activeLines.length + 8)}` };

  refs.getRow(1).values = ["Код отд.", "Стоимостная группа", "Медиана ФОТ, руб./мес", "Комментарий"];
  styleHeader(refs.getRow(1));
  exportRates.forEach((rate, index) => {
    refs.getRow(index + 2).values = [rate.code, rate.group, rate.monthlySalaryMedian, rate.comment];
  });
  const rdStart = exportRates.length + 5;
  refs.getRow(rdStart).values = ["Марка РД", "Наименование комплекта", "Код отд.", "Ядро", "Часто"];
  styleHeader(refs.getRow(rdStart));
  snapshot.catalog.rdReference.forEach((item, index) => {
    refs.getRow(rdStart + index + 1).values = [
      item.mark,
      item.name,
      item.departmentCode,
      item.isCore ? 1 : 0,
      item.isFrequentPublicBuilding ? 1 : 0,
    ];
  });
  setColumns(refs, [14, 42, 18, 20, 18, 18]);
  refs.getColumn(3).numFmt = rub;

  sbc.getCell("A1").value = "Нормативный расчет ПИР по ФГИС ЦС";
  styleTitle(sbc.getCell("A1"));
  sbc.mergeCells("A1:B1");
  sbc.getRow(3).values = ["Параметр", "Значение", "Расшифровка / методика"];
  styleHeader(sbc.getRow(3));
  const indicatorExplanation = explainFgisIndicator(
    snapshot.project.sbcFgisIndicatorUnit ?? "ед.",
    snapshot.project.sbcFgisObjectName ?? "",
  );
  const structuredSbc = Boolean(snapshot.result.sbc.officialBreakdown);
  const sbcBaseFormula = snapshot.result.sbc.normativeTrace.ruleCode === "8.1"
    ? "B11+B12*B13"
    : `ROUND(${snapshot.result.sbc.basePrice},2)`;
  const sbcFirstConditionCoefficient = structuredSbc
    ? snapshot.result.sbc.normativeTrace.normSpecificCoefficient
    : snapshot.project.sbcComplexityCoefficient;
  const sbcSecondConditionCoefficient = structuredSbc
    ? snapshot.result.sbc.normativeTrace.specialStatusCoefficient * snapshot.result.sbc.normativeTrace.smrShareCoefficient
    : snapshot.project.sbcAdjustmentCoefficient;
  const sbcRows: Array<[string, ExcelJS.CellValue, string]> = [
    ["Вид работ", snapshot.project.sbcFgisKind === "survey" ? "Инженерные изыскания" : "Проектные работы", "Определяет применимую группу нормативов и метод расчёта."],
    ["Период индекса", snapshot.project.sbcFgisPeriodLabel, "Квартал, к которому приводится базовая цена."],
    ["Норматив", snapshot.project.sbcCollectionName, "Официальный документ ФГИС ЦС, по которому выбран объект и таблица."],
    ["Утверждение", snapshot.project.sbcFgisApprovingAct, "Приказ или иной акт, которым утверждён норматив."],
    ["Уровень цен", snapshot.project.sbcBaseYear, "Дата базового уровня цен параметров a и b."],
    ["Индекс ФГИС", snapshot.project.sbcIndexToCurrent, "Множитель перевода базовой цены в выбранный текущий квартал."],
    ["Метод", snapshot.project.sbcMethod === "natural" ? "a + b × X" : "% от стоимости строительства", "Натуральный метод использует физический объём X; процентный — стоимость строительства и нормативную долю."],
    ["Постоянная a", snapshot.project.sbcConstantA, "Фиксированная часть базовой цены из строки нормативной таблицы, ₽."],
    ["Показатель b", snapshot.project.sbcConstantB, `Цена одной единицы X в базовом уровне цен, ₽/${snapshot.project.sbcFgisIndicatorUnit || "ед."}.`],
    ["Натуральный показатель X", snapshot.project.sbcNaturalIndicator, `${indicatorExplanation.label}. ${indicatorExplanation.description}`],
    ["Стоимость строительства", snapshot.project.sbcConstructionCost, "База для процентного метода в уровне цен, предусмотренном нормативом."],
    ["Норматив проектирования", snapshot.project.sbcDesignPercent, "Доля стоимости проектирования для процентного метода: 0,04 = 4%."],
    ["Коэффициент условий норматива", sbcFirstConditionCoefficient, "Для структурированного норматива определяется выбранными условиями."],
    ["Остальные нормативные коэффициенты", sbcSecondConditionCoefficient, "Специальный статус и коэффициент доли СМР либо ручной коэффициент для неструктурированного документа."],
    [
      "Базовая цена",
      formula(
        sbcBaseFormula,
        snapshot.result.sbc.basePrice,
      ),
      "Шаг 1: Cбаз = a + b × X либо Cстр × p.",
    ],
    ["С коэффициентами", formula("B18*B16*B17", snapshot.result.sbc.adjustedBasePrice), "Шаг 2: Cусл = Cбаз × Kусл × Kдоп."],
    ["Текущая стоимость без НДС", formula("B19*B9", snapshot.result.sbc.currentPriceWithoutVat), "Шаг 3: Cтек = Cусл × индекс ФГИС."],
    ["НДС", snapshot.project.vatRate, "Ставка НДС: 0,22 = 22%."],
    ["Текущая стоимость с НДС", formula("B20*(1+B21)", snapshot.result.sbc.currentPriceWithVat), "Шаг 4: Cндс = Cтек × (1 + ставка НДС)."],
    ["Доля ПД", snapshot.project.sbcPdShare, "Часть текущей цены, относимая к проектной документации."],
    ["Доля РД", snapshot.project.sbcRdShare, "Часть текущей цены, относимая к рабочей документации."],
    ["ПД без НДС", formula("B20*B23/MAX(1,B23+B24)", snapshot.result.sbc.pdPriceWithoutVat), "Текущая цена без НДС × эффективная доля ПД. При сумме долей выше 100% они нормализуются пропорционально."],
    ["РД без НДС", formula("B20*B24/MAX(1,B23+B24)", snapshot.result.sbc.rdPriceWithoutVat), "Текущая цена без НДС × эффективная доля РД. При сумме долей выше 100% они нормализуются пропорционально."],
    ["Источник", snapshot.project.sbcFgisSourceUrl, "Прямая ссылка на официальный документ ФГИС ЦС."],
    ["SHA-256 снимка каталога", snapshot.project.sbcFgisCatalogSha256, "Контрольная сумма версии локального каталога для воспроизводимости."],
    ["Таблица ФГИС", snapshot.project.sbcFgisTableCode ?? "", "Код таблицы, из которой выбрана нормативная строка."],
    ["Наименование таблицы", snapshot.project.sbcFgisTableTitle ?? "", "Раздел нормативного документа с выбранным типом объекта."],
    ["Объект проектирования", snapshot.project.sbcFgisObjectName ?? "", "Тип объекта, к которому относится выбранная строка."],
    ["Единица натурального показателя", snapshot.project.sbcFgisIndicatorUnit ?? "", `Единица измерения показателя «${indicatorExplanation.label}».`],
    ["Диапазон строки", snapshot.project.sbcFgisIndicatorRange ?? "", "Интервал X, в котором действуют выбранные параметры a и b."],
    ["Страница PDF", snapshot.project.sbcFgisTablePage ?? "", "Страница официального PDF для ручной проверки исходных данных."],
    ["Расчёт допустим", snapshot.result.sbc.normativeTrace.valid ? "Да" : "Нет", "При блокирующем условии итоговая цена не выдаётся."],
    ["Применённое правило", snapshot.result.sbc.normativeTrace.ruleCode, snapshot.result.sbc.normativeTrace.ruleTitle],
    ["Формула правила", snapshot.result.sbc.normativeTrace.formula, "Формула с фактическими исходными значениями."],
    ["Нормативное основание", snapshot.result.sbc.normativeTrace.source, snapshot.result.sbc.normativeTrace.sourcePage ? `Страница ${snapshot.result.sbc.normativeTrace.sourcePage}.` : ""],
    ["Коэффициент приведения стоимости", snapshot.result.sbc.normativeTrace.constructionRebaseCoefficient, "Приведение исходной стоимости строительства к уровню цен норматива."],
    ["Стоимость строительства в уровне норматива", snapshot.result.sbc.normativeTrace.baseConstructionCost ?? 0, "Исходная стоимость × коэффициент приведения."],
    ["Доля СМР", snapshot.result.sbc.normativeTrace.smrSharePercent / 100, "Доля строительно-монтажных работ в общей стоимости строительства."],
    ["Коэффициент доли СМР", snapshot.result.sbc.normativeTrace.smrShareCoefficient, "Коэффициент по п. 140 Методики № 707/пр."],
    ["Коэффициент условий № 848/пр", snapshot.result.sbc.normativeTrace.normSpecificCoefficient, "1,1 при зоне охраны либо не менее трёх факторов стеснённости."],
    ["Коэффициент специального статуса", snapshot.result.sbc.normativeTrace.specialStatusCoefficient, "Временный коэффициент 1,3 при выполнении всех условий."],
    ["Общий нормативный коэффициент", snapshot.result.sbc.normativeTrace.totalCoefficient, "Произведение применённых коэффициентов."],
    ["Блокирующие условия", snapshot.result.sbc.normativeTrace.blockers.join("; "), "Причины остановки расчёта."],
    ["Предупреждения", snapshot.result.sbc.normativeTrace.warnings.join("; "), "Что необходимо подтвердить исходными документами."],
  ];
  sbc.addRows(sbcRows);
  setColumns(sbc, [34, 44, 78]);
  [9, 11, 12, 14, 18, 19, 20, 22, 25, 26].forEach((row) => {
    sbc.getCell(`B${row}`).numFmt = rub;
  });
  [15, 21, 23, 24].forEach((row) => {
    sbc.getCell(`B${row}`).numFmt = percent;
  });
  sbc.getCell("B9").numFmt = "0.00";
  sbc.getCell("B27").value = {
    text: snapshot.project.sbcFgisSourceUrl,
    hyperlink: snapshot.project.sbcFgisSourceUrl,
  };

  const officialBreakdown = snapshot.result.sbc.officialBreakdown;
  sbcBreakdown.getCell("A1").value = "Нормативная стоимость ПД и РД по разделам";
  styleTitle(sbcBreakdown.getCell("A1"));
  sbcBreakdown.mergeCells("A1:G1");
  sbcBreakdown.getCell("A2").value = officialBreakdown
    ? `Таблица ${officialBreakdown.tableCode}, стр. ${officialBreakdown.page}: ${officialBreakdown.objectName}`
    : "Для выбранного норматива официальное распределение по разделам отсутствует";
  sbcBreakdown.mergeCells("A2:G2");
  sbcBreakdown.getCell("A3").value = "Это нормативный расчёт стоимости проектных работ, а не смета материалов и СМР и не калькуляция команды по зарплатным ставкам. Контакты: OVC.me";
  sbcBreakdown.mergeCells("A3:G3");
  sbcBreakdown.getRow(4).values = [
    "Раздел",
    "Наименование",
    "Доля ПД",
    "ПД без НДС",
    "Доля РД",
    "РД без НДС",
    "Всего без НДС",
  ];
  styleHeader(sbcBreakdown.getRow(4));

  if (officialBreakdown) {
    officialBreakdown.sections.forEach((section, index) => {
      const rowNumber = index + 5;
      sbcBreakdown.getRow(rowNumber).values = [
        section.code,
        section.name,
        section.pdSharePercent / 100,
        formula(`'СБЦ ФГИС'!$B$25*C${rowNumber}`, section.pdPriceWithoutVat),
        section.rdSharePercent / 100,
        formula(`'СБЦ ФГИС'!$B$26*E${rowNumber}`, section.rdPriceWithoutVat),
        formula(`D${rowNumber}+F${rowNumber}`, section.totalPriceWithoutVat),
      ];
    });

    let nextRow = officialBreakdown.sections.length + 5;
    if (officialBreakdown.pdUnallocatedWithoutVat || officialBreakdown.rdUnallocatedWithoutVat) {
      sbcBreakdown.getRow(nextRow).values = [
        "Остаток",
        "Не распределён опубликованной строкой ФГИС",
        Math.max(0, 100 - officialBreakdown.pdPublishedTotalPercent) / 100,
        officialBreakdown.pdUnallocatedWithoutVat,
        Math.max(0, 100 - officialBreakdown.rdPublishedTotalPercent) / 100,
        officialBreakdown.rdUnallocatedWithoutVat,
        formula(`D${nextRow}+F${nextRow}`, officialBreakdown.pdUnallocatedWithoutVat + officialBreakdown.rdUnallocatedWithoutVat),
      ];
      sbcBreakdown.getRow(nextRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFAE8" } };
      nextRow += 1;
    }

    const firstSectionRow = 5;
    const lastDetailRow = nextRow - 1;
    sbcBreakdown.getRow(nextRow).values = [
      "ИТОГО",
      "ПД + РД",
      officialBreakdown.pdSharePercent / 100,
      formula(`SUM(D${firstSectionRow}:D${lastDetailRow})`, snapshot.result.sbc.pdPriceWithoutVat),
      officialBreakdown.rdSharePercent / 100,
      formula(`SUM(F${firstSectionRow}:F${lastDetailRow})`, snapshot.result.sbc.rdPriceWithoutVat),
      formula(`D${nextRow}+F${nextRow}`, snapshot.result.sbc.currentPriceWithoutVat),
    ];
    sbcBreakdown.getRow(nextRow).font = { bold: true, color: { argb: "FF172033" } };
    sbcBreakdown.getRow(nextRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F4F8" } };
    for (let row = 5; row <= nextRow; row += 1) {
      sbcBreakdown.getCell(`C${row}`).numFmt = "0.0%";
      sbcBreakdown.getCell(`E${row}`).numFmt = "0.0%";
      ["D", "F", "G"].forEach((column) => { sbcBreakdown.getCell(`${column}${row}`).numFmt = rub; });
    }
  }
  setColumns(sbcBreakdown, [14, 58, 14, 22, 14, 22, 24]);

  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", wrapText: true };
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function saveEstimateWorkbook(snapshot: CalculationSnapshot, bytes: Uint8Array) {
  const fallbackName = `${snapshot.name.replace(/[\\/:*?"<>|]+/g, "_")}.xlsx`;

  if (isTauriRuntime()) {
    const path = await save({
      defaultPath: fallbackName,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!path) return null;
    await writeFile(path, bytes);
    return path;
  }

  saveAs(
    new Blob([toArrayBuffer(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fallbackName,
  );
  return fallbackName;
}
