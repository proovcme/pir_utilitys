import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  buildPirSummaryRows,
  calculatePirLabor,
  workKindLabel,
  type PirEstimatePassport,
  type PirLaborInput,
  type PirSummaryExtra,
  type PirSummaryRow,
} from "../domain/pirForms";
import type { SbcResult } from "../domain/types";

const rub = '#,##0.00" ₽"';
const percent = "0.00%";

function styleTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 16, color: { argb: "FF172033" } };
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA72525" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function addPassport(sheet: ExcelJS.Worksheet, passport: PirEstimatePassport, formLabel: string) {
  const rows: Array<[string, string | number]> = [
    ["Форма", formLabel],
    ["Наименование стройки", passport.constructionName],
    ["Заказчик", passport.customer],
    ["Проектная организация", passport.designOrganization],
    ["Генеральный проектировщик", passport.generalDesigner],
    ["Уровень цен", passport.priceLevelYear],
  ];
  rows.forEach(([label, value], index) => {
    sheet.getCell(`A${index + 3}`).value = label;
    sheet.getCell(`B${index + 3}`).value = value;
    sheet.getCell(`A${index + 3}`).font = { bold: true, color: { argb: "FF7F1D1D" } };
  });
}

function finishWorkbook(workbook: ExcelJS.Workbook) {
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
    }));
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  });
}

function addSourceSheet(workbook: ExcelJS.Workbook, laborInput: PirLaborInput) {
  const source = workbook.addWorksheet("Источники", { views: [{ showGridLines: false }] });
  source.getCell("A1").value = "Основания расчёта по форме 3П";
  styleTitle(source.getCell("A1"));
  source.mergeCells("A1:C1");
  source.getRow(3).values = ["Показатель", "Значение", "Как применяется"];
  styleHeader(source.getRow(3));
  source.addRows([
    ["Методика", "Приказ Минстроя России от 01.10.2021 № 707/пр", "Пункты 143 и 145, приложение № 2, рекомендуемый образец формы 3П в приложении № 7."],
    ["Год данных о зарплате", laborInput.sourceYear, "Год, предшествующий году составления сметы."],
    ["Средняя зарплата по ОКВЭД 71.11", laborInput.ordinaryMonthlySalary, "Для обычной проектной документации."],
    ["Средняя зарплата по ОКВЭД 71.12", laborInput.specialMonthlySalary, "Для особо опасных, технически сложных и уникальных объектов, а также информационной модели."],
    ["Рабочих дней в месяце", laborInput.averageWorkingDaysPerMonth, "Среднее за год по производственному календарю."],
    ["Источник зарплаты", laborInput.salarySource, "Ссылка или реквизиты официальной публикации Росстата."],
    ["Доля зарплаты в себестоимости Кз", laborInput.salaryShareInCost, "Норматив 0,4 по пункту 145 Методики."],
    ["Рентабельность Р", laborInput.profitabilityRate, "10% по таблице 1.2 приложения № 2."],
    ["Контакты", "OVC.me", "Вопросы по применению калькулятора."],
  ]);
  source.getCell("B6").numFmt = rub;
  source.getCell("B7").numFmt = rub;
  source.getCell("B10").numFmt = percent;
  source.getCell("B11").numFmt = percent;
  setWidths(source, [38, 54, 82]);
}

export async function buildPirLaborWorkbook(passport: PirEstimatePassport, input: PirLaborInput): Promise<Uint8Array> {
  const result = calculatePirLabor(input);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OVC.me";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const form = workbook.addWorksheet("Форма 3П", { views: [{ showGridLines: false }] });
  form.getCell("A1").value = `Смета № ${passport.estimate3pNumber || "—"} на проектные работы по калькуляции затрат (форма 3П)`;
  styleTitle(form.getCell("A1"));
  form.mergeCells("A1:J1");
  addPassport(form, passport, "3П");
  let row = 11;
  result.works.forEach((workResult, index) => {
    form.getCell(`A${row}`).value = `Калькуляция ${passport.estimate3pNumber || "—"}.${index + 1}: ${workResult.work.name || "Наименование не указано"}`;
    form.getCell(`A${row}`).font = { bold: true, size: 13, color: { argb: "FF7F1D1D" } };
    form.mergeCells(`A${row}:J${row}`);
    row += 1;
    form.getCell(`A${row}`).value = `${workResult.work.stage} · ${workKindLabel(workResult.work.kind)} · основание: ${workResult.work.basis || "не указано"}`;
    form.mergeCells(`A${row}:J${row}`);
    row += 2;
    form.getRow(row).values = ["№", "Должность", "Тф, дней", "Тп, дней", "Численность", "Индекс", "Вклад в Ккв-уч", "Взвешенные чел.-дни", "Таблица", "Контроль"];
    styleHeader(form.getRow(row));
    const participantStart = row + 1;
    workResult.participants.forEach((participant, participantIndex) => {
      const current = participantStart + participantIndex;
      const contribution = workResult.totalHeadcount > 0 && workResult.work.plannedDurationDays > 0
        ? participant.weightedPersonDays / (workResult.work.plannedDurationDays * workResult.totalHeadcount)
        : 0;
      form.getRow(current).values = [
        participantIndex + 1,
        participant.qualification.title,
        participant.actualDays,
        workResult.work.plannedDurationDays,
        participant.headcount,
        participant.qualification.index,
        contribution,
        participant.weightedPersonDays,
        `Таблица ${participant.qualification.table}`,
        workResult.valid ? "Заполнено" : workResult.warnings.join(" "),
      ];
      form.getCell(`G${current}`).numFmt = "0.000";
      form.getCell(`H${current}`).numFmt = "0.000";
    });
    row = participantStart + Math.max(1, workResult.participants.length);
    form.getRow(row).values = ["", "ИТОГО", "", "", workResult.totalHeadcount, "", workResult.qualificationParticipationCoefficient, workResult.weightedPersonDays, "", ""];
    form.getRow(row).font = { bold: true };
    form.getCell(`G${row}`).numFmt = "0.000";
    form.getCell(`H${row}`).numFmt = "0.000";
    row += 2;
    form.getRow(row).values = ["Средняя зарплата, ₽/мес.", "Рабочих дней/мес.", "Средняя дневная зарплата", "Кз", "Рентабельность", "Средняя дневная выработка", "Тп", "Численность", "Ккв-уч", "Стоимость без НДС"];
    styleHeader(form.getRow(row));
    row += 1;
    form.getRow(row).values = [
      workResult.monthlySalary,
      input.averageWorkingDaysPerMonth,
      workResult.averageDailySalary,
      input.salaryShareInCost,
      input.profitabilityRate,
      workResult.averageDailyOutput,
      workResult.work.plannedDurationDays,
      workResult.totalHeadcount,
      workResult.qualificationParticipationCoefficient,
      workResult.costWithoutVat,
    ];
    ["A", "C", "F", "J"].forEach((column) => { form.getCell(`${column}${row}`).numFmt = rub; });
    form.getCell(`D${row}`).numFmt = percent;
    form.getCell(`E${row}`).numFmt = percent;
    form.getCell(`I${row}`).numFmt = "0.000";
    row += 3;
  });
  form.getCell(`H${row}`).value = "Итого без НДС";
  form.getCell(`J${row}`).value = result.totalWithoutVat;
  form.getCell(`H${row + 1}`).value = `НДС ${input.vatRate * 100}%`;
  form.getCell(`J${row + 1}`).value = result.vatAmount;
  form.getCell(`H${row + 2}`).value = "Итого с НДС";
  form.getCell(`J${row + 2}`).value = result.totalWithVat;
  [row, row + 1, row + 2].forEach((current) => {
    form.getCell(`H${current}`).font = { bold: true };
    form.getCell(`J${current}`).font = { bold: true };
    form.getCell(`J${current}`).numFmt = rub;
  });
  form.getCell(`A${row + 5}`).value = "Руководитель проектной организации ____________________";
  form.getCell(`A${row + 6}`).value = "Главный инженер проекта ______________________________";
  form.getCell(`F${row + 5}`).value = "Начальник отдела _____________________________________";
  form.getCell(`F${row + 6}`).value = "Заказчик _____________________________________________";
  setWidths(form, [18, 60, 14, 14, 16, 12, 18, 20, 14, 38]);

  const detail = workbook.addWorksheet("Трудозатраты", { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
  detail.getCell("A1").value = "Подробная ведомость трудозатрат";
  styleTitle(detail.getCell("A1"));
  detail.mergeCells("A1:M1");
  detail.getCell("A2").value = "Формулы 8.12–8.14 Методики № 707/пр. Каждая строка сохраняет исходные данные и расчётный вклад.";
  detail.mergeCells("A2:M2");
  detail.getRow(4).values = ["Калькуляция", "Работа", "Стадия", "Характер", "Должность", "Тф", "Тп", "Численность", "Индекс", "Взвешенные чел.-дни", "Средняя дневная выработка", "Стоимость", "Основание"];
  styleHeader(detail.getRow(4));
  let detailRow = 5;
  result.works.forEach((workResult, workIndex) => workResult.participants.forEach((participant) => {
    detail.getRow(detailRow).values = [
      `${passport.estimate3pNumber || "—"}.${workIndex + 1}`,
      workResult.work.name,
      workResult.work.stage,
      workKindLabel(workResult.work.kind),
      participant.qualification.title,
      participant.actualDays,
      workResult.work.plannedDurationDays,
      participant.headcount,
      participant.qualification.index,
      participant.weightedPersonDays,
      workResult.averageDailyOutput,
      participant.weightedPersonDays * workResult.averageDailyOutput,
      workResult.work.basis,
    ];
    detail.getCell(`K${detailRow}`).numFmt = rub;
    detail.getCell(`L${detailRow}`).numFmt = rub;
    detailRow += 1;
  }));
  setWidths(detail, [16, 38, 16, 32, 58, 10, 10, 14, 10, 20, 24, 22, 48]);
  addSourceSheet(workbook, input);
  finishWorkbook(workbook);
  const data = await workbook.xlsx.writeBuffer();
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
}

function addSummaryRows(sheet: ExcelJS.Worksheet, rows: PirSummaryRow[], vatRate: number) {
  sheet.getRow(11).values = ["№", "Перечень выполняемых работ", "Характеристика", "Ссылка на смету или калькуляцию", "Стоимость без НДС", "НДС", "Полная стоимость"];
  styleHeader(sheet.getRow(11));
  rows.forEach((row, index) => {
    const current = index + 12;
    sheet.getRow(current).values = [index + 1, row.name, row.characteristic, row.reference, row.costWithoutVat, row.vatAmount, row.costWithVat];
    ["E", "F", "G"].forEach((column) => { sheet.getCell(`${column}${current}`).numFmt = rub; });
  });
  const total = rows.length + 12;
  sheet.getRow(total).values = ["", "ИТОГО ПО СВОДНОЙ СМЕТЕ", "", "", rows.reduce((sum, item) => sum + item.costWithoutVat, 0), rows.reduce((sum, item) => sum + item.vatAmount, 0), rows.reduce((sum, item) => sum + item.costWithVat, 0)];
  sheet.getRow(total).font = { bold: true };
  ["E", "F", "G"].forEach((column) => { sheet.getCell(`${column}${total}`).numFmt = rub; });
  sheet.getCell(`A${total + 2}`).value = `НДС рассчитан отдельно по ставке ${vatRate * 100}%. Контакты: OVC.me`;
  sheet.mergeCells(`A${total + 2}:G${total + 2}`);
  sheet.getCell(`A${total + 4}`).value = "Руководитель организации ______________________________";
  sheet.getCell(`A${total + 5}`).value = "Составил ______________________________________________";
  sheet.getCell(`E${total + 4}`).value = "Проверил ______________________________________________";
}

export async function buildPirSummaryWorkbook(
  passport: PirEstimatePassport,
  form2pResult: SbcResult,
  form2pName: string,
  laborInput: PirLaborInput,
  extras: PirSummaryExtra[],
): Promise<Uint8Array> {
  const laborResult = calculatePirLabor(laborInput);
  const rows = buildPirSummaryRows(passport, form2pName, form2pResult.currentPriceWithoutVat, laborResult, extras, laborInput.vatRate);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OVC.me";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Форма 1П", { views: [{ showGridLines: false }] });
  sheet.getCell("A1").value = "Сводная смета на проектные работы (форма 1П)";
  styleTitle(sheet.getCell("A1"));
  sheet.mergeCells("A1:G1");
  addPassport(sheet, passport, "1П");
  addSummaryRows(sheet, rows, laborInput.vatRate);
  setWidths(sheet, [8, 42, 46, 38, 22, 20, 22]);
  addSourceSheet(workbook, laborInput);
  finishWorkbook(workbook);
  const data = await workbook.xlsx.writeBuffer();
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
}

async function download(bytes: Uint8Array, fileName: string) {
  const blobData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  saveAs(new Blob([blobData as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

export async function downloadPirLaborWorkbook(passport: PirEstimatePassport, input: PirLaborInput) {
  await download(await buildPirLaborWorkbook(passport, input), `Форма_3П_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadPirSummaryWorkbook(
  passport: PirEstimatePassport,
  form2pResult: SbcResult,
  form2pName: string,
  laborInput: PirLaborInput,
  extras: PirSummaryExtra[],
) {
  await download(await buildPirSummaryWorkbook(passport, form2pResult, form2pName, laborInput, extras), `Форма_1П_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
