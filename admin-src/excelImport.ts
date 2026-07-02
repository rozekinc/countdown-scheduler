// One-time Excel (.xlsx) import: parses a worksheet client-side into the
// scheduleDays row shape ({A, B} pairs). Never saves automatically -- the
// caller must show the parsed rows for review and only save when the user
// confirms.

import * as XLSX from "xlsx";
import type { ScheduleRow } from "./types";

export async function parseXlsxToRows(file: File): Promise<ScheduleRow[]> {
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
    .map((row): ScheduleRow => ({
      A: row[0] !== undefined ? String(row[0]) : "",
      B: row[1] !== undefined ? String(row[1]) : "",
    }))
    .filter((row) => row.A !== "" || row.B !== "");
}
