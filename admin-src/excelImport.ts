// One-time Excel (.xlsx) import: parses a worksheet client-side into the
// scheduleDays item shape ({title, detail} pairs -- column A -> title,
// column B -> detail). Never saves automatically -- the caller must show
// the parsed items for review and only save when the user confirms.

import * as XLSX from "xlsx";
import type { ScheduleItem } from "./types";

export async function parseXlsxToItems(file: File): Promise<ScheduleItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, {
    header: 1,
    blankrows: false,
  });

  return rows
    .map((row): ScheduleItem => ({
      title: row[0] !== undefined ? String(row[0]) : "",
      detail: row[1] !== undefined ? String(row[1]) : "",
    }))
    .filter((item) => item.title !== "" || item.detail !== "");
}
