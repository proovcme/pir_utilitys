import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { RateGroup } from "../domain/types";

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;
const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

async function saveBytes(fileName: string, bytes: Uint8Array, mimeType: string, extensions: string[]) {
  if (isTauriRuntime()) {
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: extensions.join(", ").toUpperCase(), extensions }],
    });
    if (!path) return null;
    await writeFile(path, bytes);
    return path;
  }

  saveAs(new Blob([toArrayBuffer(bytes)], { type: mimeType }), fileName);
  return fileName;
}

const escapeCsv = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === ";" || char === ",") && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

export async function exportRatesCsv(rates: RateGroup[]) {
  const rows = [
    ["Код отд.", "Стоимостная группа", "Медиана ФОТ, руб./мес", "Комментарий"],
    ...rates.map((rate) => [rate.code, rate.group ?? "", rate.monthlySalaryMedian, rate.comment ?? ""]),
  ];
  const csv = `\ufeff${rows.map((row) => row.map(escapeCsv).join(";")).join("\n")}`;
  return saveBytes(
    "stavki.csv",
    new TextEncoder().encode(csv),
    "text/csv;charset=utf-8",
    ["csv"],
  );
}

export async function exportRatesXlsx(rates: RateGroup[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ставки", { views: [{ showGridLines: false }] });
  sheet.addRow(["Код отд.", "Стоимостная группа", "Медиана ФОТ, руб./мес", "Комментарий"]);
  rates.forEach((rate) => {
    sheet.addRow([rate.code, rate.group ?? "", rate.monthlySalaryMedian, rate.comment ?? ""]);
  });
  sheet.columns = [
    { width: 16 },
    { width: 42 },
    { width: 22 },
    { width: 42 },
  ];
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA72525" } };
  });
  sheet.getColumn(3).numFmt = '#,##0" ₽"';
  const buffer = await workbook.xlsx.writeBuffer();
  return saveBytes(
    "stavki.xlsx",
    new Uint8Array(buffer),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ["xlsx"],
  );
}

export async function importRatesFile(file: File): Promise<RateGroup[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rates: RateGroup[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = String(row.getCell(1).value ?? "").trim();
      if (!code) return;
      rates.push({
        code,
        group: String(row.getCell(2).value ?? "").trim() || null,
        monthlySalaryMedian: Number(row.getCell(3).value ?? 0),
        comment: String(row.getCell(4).value ?? "").trim() || null,
      });
    });
    return rates;
  }

  const text = (await file.text()).replace(/^\ufeff/, "");
  return text
    .split(/\r?\n/)
    .slice(1)
    .map(parseCsvLine)
    .filter((row) => row[0])
    .map((row) => ({
      code: row[0],
      group: row[1] || null,
      monthlySalaryMedian: Number(String(row[2] ?? "0").replace(/\s/g, "").replace(",", ".")),
      comment: row[3] || null,
    }));
}
