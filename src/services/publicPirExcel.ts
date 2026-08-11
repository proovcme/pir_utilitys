import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { ProjectInput, SbcResult } from "../domain/types";

const rub = '#,##0" ₽"';
const percent = "0.0%";
const formula = (formulaText: string, result: number) => ({ formula: formulaText, result });

function header(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA72525" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function widths(sheet: ExcelJS.Worksheet, values: number[]) {
  values.forEach((value, index) => { sheet.getColumn(index + 1).width = value; });
}

export async function buildPublicPirWorkbook(project: ProjectInput, result: SbcResult): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OVC.me";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const calculation = workbook.addWorksheet("Расчёт", { views: [{ showGridLines: false }] });
  calculation.getCell("A1").value = "Нормативный расчёт стоимости проектных работ";
  calculation.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF172033" } };
  calculation.mergeCells("A1:C1");
  calculation.getCell("A2").value = "По данным ФГИС ЦС. Это не локальная или объектная смета строительства и не калькуляция команды по зарплатным ставкам.";
  calculation.mergeCells("A2:C2");
  calculation.getRow(4).values = ["Показатель", "Значение", "Как используется"];
  header(calculation.getRow(4));

  const structured = Boolean(result.officialBreakdown);
  const basePriceFormula = result.normativeTrace.ruleCode === "8.1"
    ? `B9+B10*B11+${result.normativeTrace.airConditioningAdditionalBasePrice}`
    : `ROUND(${result.basePrice},2)`;
  const firstConditionCoefficient = structured
    ? result.normativeTrace.normSpecificCoefficient
    : project.sbcComplexityCoefficient;
  const secondConditionCoefficient = structured
    ? result.normativeTrace.normTableCoefficient
      * result.normativeTrace.complexRoleCoefficient
      * result.normativeTrace.specialStatusCoefficient
      * result.normativeTrace.smrShareCoefficient
    : project.sbcAdjustmentCoefficient;
  const isBim = Boolean(project.sbcInformationModel);
  const pdShare = result.officialBreakdown ? result.officialBreakdown.pdSharePercent / 100 : project.sbcPdShare;
  const rdShare = result.officialBreakdown ? result.officialBreakdown.rdSharePercent / 100 : project.sbcRdShare;
  const adjustedFormula = isBim
    ? `B14*B15*B16*(B20*${result.normativeTrace.bimPdCoefficient}+B22*${result.normativeTrace.bimRdCoefficient})`
    : "B14*B15*B16";
  const pdFormula = isBim
    ? `B14*B15*B16*B20*${result.normativeTrace.bimPdCoefficient}*B18`
    : "B19*B20";
  const rdFormula = isBim
    ? `B14*B15*B16*B22*${result.normativeTrace.bimRdCoefficient}*B18`
    : "B19*B22";
  const rows: Array<[string, ExcelJS.CellValue, string]> = [
    ["Норматив", project.sbcCollectionName, "Официальный документ, по которому выполнен расчёт."],
    ["Период", project.sbcFgisPeriodLabel, "Текущий квартал для пересчёта цены."],
    ["Таблица", project.sbcFgisTableCode ?? "", "Таблица выбранного объекта или таблица 3.18."],
    ["Объект", project.sbcFgisObjectName ?? "", "Тип проектируемого объекта."],
    ["Постоянная a", project.sbcConstantA, "Фиксированная часть базовой цены, ₽."],
    ["Показатель b", project.sbcConstantB, `Цена единицы показателя, ₽/${project.sbcFgisIndicatorUnit || "ед."}.`],
    ["Натуральный показатель", project.sbcNaturalIndicator, `Введённое значение, ${project.sbcFgisIndicatorUnit || "ед."}.`],
    ["Стоимость строительства", project.sbcConstructionCost, "Используется только для таблицы 3.18."],
    ["Норматив от стоимости", project.sbcDesignPercent, "Используется только для таблицы 3.18."],
    ["Базовая цена", formula(basePriceFormula, result.basePrice), `Результат правила ${result.normativeTrace.ruleCode}.`],
    ["Коэффициент условий норматива", firstConditionCoefficient, "Для НЗ № 848/пр определяется выбранными условиями, а не свободным вводом."],
    ["Остальные нормативные коэффициенты", secondConditionCoefficient, "Условие специальной таблицы, роль позиции, специальный статус и коэффициент доли СМР."],
    ["Цена с коэффициентами", formula(adjustedFormula, result.adjustedBasePrice), isBim ? "Базовая цена × общие условия × доли стадий × отдельные коэффициенты информационной модели." : "Базовая цена × коэффициенты."],
    ["Индекс текущего периода", project.sbcIndexToCurrent, "Перевод базовой цены в выбранный квартал."],
    ["Текущая стоимость без НДС", formula("B17*B18", result.currentPriceWithoutVat), "Нормативная стоимость ПД + РД."],
    ["Доля ПД", pdShare, isBim ? "Для документации с информационной моделью — 60% по п. 23 НЗ № 848/пр." : "Доля проектной документации."],
    ["ПД без НДС", formula(pdFormula, result.pdPriceWithoutVat), "Стоимость проектной документации."],
    ["Доля РД", rdShare, isBim ? "Для документации с информационной моделью — 40%; для РД по обычной ПД — 60% по п. 24." : "Доля рабочей документации."],
    ["РД без НДС", formula(rdFormula, result.rdPriceWithoutVat), "Стоимость рабочей документации."],
    ["НДС", project.vatRate, "Действующая ставка в расчёте."],
    ["Итого с НДС", formula("B19*(1+B24)", result.currentPriceWithVat), "Стоимость проектных работ с НДС."],
    ["Источник", project.sbcFgisSourceUrl, "Прямая ссылка на официальный документ ФГИС ЦС."],
    ["Контакты", "OVC.me", "Вопросы по применению калькулятора."],
    ["Расчёт допустим", result.normativeTrace.valid ? "Да" : "Нет", "При наличии блокирующего условия итоговая цена не выдаётся."],
    ["Применённое правило", result.normativeTrace.ruleCode, result.normativeTrace.ruleTitle],
    ["Формула", result.normativeTrace.formula, "Подробная формула применённого нормативного правила."],
    ["Нормативное основание", result.normativeTrace.source, result.normativeTrace.sourcePage ? `Страница ${result.normativeTrace.sourcePage}.` : ""],
    ["Коэффициент приведения стоимости", result.normativeTrace.constructionRebaseCoefficient, "Приведение исходной стоимости строительства к уровню цен норматива."],
    ["Стоимость строительства в уровне норматива", result.normativeTrace.baseConstructionCost ?? 0, "Исходная стоимость × коэффициент приведения."],
    ["Доля СМР", result.normativeTrace.smrSharePercent / 100, "Доля строительно-монтажных работ в стоимости строительства."],
    ["Коэффициент доли СМР", result.normativeTrace.smrShareCoefficient, "Коэффициент по п. 140 Методики № 707/пр."],
    ["Коэффициент условий № 848/пр", result.normativeTrace.normSpecificCoefficient, "1,1 при зоне охраны либо не менее трёх факторов стеснённости."],
    ["Коэффициент специальной таблицы № 848/пр", result.normativeTrace.normTableCoefficient, "Таблицы 3.3.1, 3.5.1, 3.7.1, 3.11.1 или 3.17.1."],
    ["Коэффициент роли позиции", result.normativeTrace.complexRoleCoefficient, "Основной, встроенный, сблокированный или повторно применяемый объект."],
    ["Коэффициент специального статуса", result.normativeTrace.specialStatusCoefficient, "1,3 при одновременном выполнении установленных условий и в период действия нормы."],
    ["Коэффициент BIM для П", result.normativeTrace.bimPdCoefficient, "Таблица 1 приложения № 2 НЗ № 848/пр."],
    ["Коэффициент BIM для Р", result.normativeTrace.bimRdCoefficient, "Таблица 1 приложения № 2 НЗ № 848/пр."],
    ["Дополнительно: кондиционирование", result.normativeTrace.airConditioningAdditionalBasePrice, "3,1% для П + Р по п. 25, если раздел отсутствует в таблице распределения."],
    ["Общий коэффициент", result.normativeTrace.totalCoefficient, "Произведение всех применённых нормативных коэффициентов."],
    ["Блокирующие условия", result.normativeTrace.blockers.join("; "), "Причины, по которым итоговый расчёт остановлен."],
    ["Предупреждения", result.normativeTrace.warnings.join("; "), "Условия, которые нужно подтвердить документами."],
  ];
  calculation.addRows(rows);
  widths(calculation, [34, 52, 72]);
  [9, 10, 12, 14, 17, 19, 21, 23, 25].forEach((row) => { calculation.getCell(`B${row}`).numFmt = rub; });
  [13, 20, 22, 24, 34].forEach((row) => { calculation.getCell(`B${row}`).numFmt = percent; });
  calculation.getCell("B26").value = { text: project.sbcFgisSourceUrl, hyperlink: project.sbcFgisSourceUrl };

  const breakdown = workbook.addWorksheet("Разделы", { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
  breakdown.getCell("A1").value = "Стоимость по стадиям и разделам";
  breakdown.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF172033" } };
  breakdown.mergeCells("A1:G1");
  breakdown.getCell("A2").value = result.officialBreakdown
    ? `Таблица ${result.officialBreakdown.tableCode}, стр. ${result.officialBreakdown.page}: ${result.officialBreakdown.objectName}`
    : "Официальное распределение для выбранного документа отсутствует";
  breakdown.mergeCells("A2:G2");
  breakdown.getCell("A3").value = "Доли и суммы приведены без НДС. Контакты: OVC.me";
  breakdown.mergeCells("A3:G3");
  breakdown.getRow(4).values = ["Раздел", "Наименование", "Доля ПД", "ПД без НДС", "Доля РД", "РД без НДС", "Всего без НДС"];
  header(breakdown.getRow(4));

  if (result.officialBreakdown) {
    result.officialBreakdown.sections.forEach((section, index) => {
      const row = index + 5;
      breakdown.getRow(row).values = [
        section.code,
        section.name,
        section.pdSharePercent / 100,
        result.normativeTrace.airConditioningAdditionalBasePrice > 0 ? section.pdPriceWithoutVat : formula(`'Расчёт'!$B$21*C${row}`, section.pdPriceWithoutVat),
        section.rdSharePercent / 100,
        result.normativeTrace.airConditioningAdditionalBasePrice > 0 ? section.rdPriceWithoutVat : formula(`'Расчёт'!$B$23*E${row}`, section.rdPriceWithoutVat),
        formula(`D${row}+F${row}`, section.totalPriceWithoutVat),
      ];
    });
    const first = 5;
    let last = first + result.officialBreakdown.sections.length - 1;
    if (result.officialBreakdown.pdUnallocatedWithoutVat || result.officialBreakdown.rdUnallocatedWithoutVat) {
      last += 1;
      breakdown.getRow(last).values = [
        "Остаток",
        "Не распределён опубликованной строкой ФГИС",
        Math.max(0, 100 - result.officialBreakdown.pdPublishedTotalPercent) / 100,
        result.officialBreakdown.pdUnallocatedWithoutVat,
        Math.max(0, 100 - result.officialBreakdown.rdPublishedTotalPercent) / 100,
        result.officialBreakdown.rdUnallocatedWithoutVat,
        formula(`D${last}+F${last}`, result.officialBreakdown.pdUnallocatedWithoutVat + result.officialBreakdown.rdUnallocatedWithoutVat),
      ];
      breakdown.getRow(last).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFAE8" } };
    }
    const total = last + 1;
    breakdown.getRow(total).values = [
      "ИТОГО",
      "ПД + РД",
      result.officialBreakdown.pdSharePercent / 100,
      formula(`SUM(D${first}:D${last})`, result.pdPriceWithoutVat),
      result.officialBreakdown.rdSharePercent / 100,
      formula(`SUM(F${first}:F${last})`, result.rdPriceWithoutVat),
      formula(`D${total}+F${total}`, result.currentPriceWithoutVat),
    ];
    breakdown.getRow(total).font = { bold: true };
    for (let row = first; row <= total; row += 1) {
      breakdown.getCell(`C${row}`).numFmt = percent;
      breakdown.getCell(`E${row}`).numFmt = percent;
      ["D", "F", "G"].forEach((column) => { breakdown.getCell(`${column}${row}`).numFmt = rub; });
    }
  }
  widths(breakdown, [14, 58, 14, 22, 14, 22, 24]);

  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
    }));
  });

  const data = await workbook.xlsx.writeBuffer();
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
}

export async function downloadPublicPirWorkbook(project: ProjectInput, result: SbcResult) {
  const bytes = await buildPublicPirWorkbook(project, result);
  const blobData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  saveAs(
    new Blob([blobData as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Расчёт_стоимости_проектных_работ_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
