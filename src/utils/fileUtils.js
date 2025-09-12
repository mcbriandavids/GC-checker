import Papa from "papaparse";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Headers from "./parser";
import { COMPONENT_KEYS } from "./calculator";

export function importCSV(file, addRowsFromParsed) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (res) => {
      const normalized = res.data.map((r) => {
        const row = {};
        Headers.forEach((h) => {
          const found = Object.keys(r).find(
            (k) => k && k.toLowerCase().trim() === h.toLowerCase()
          );
          row[h] = found ? r[found] : r[h] ?? "";
        });
        return row;
      });
      addRowsFromParsed(normalized);
    },
    error: (err) => alert("CSV parse error: " + err.message),
  });
}

export function importExcel(file, addRowsFromParsed) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const wb = XLSX.read(ev.target.result, { type: "binary" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    const normalized = json.map((r) => {
      const row = {};
      Headers.forEach((h) => {
        const found = Object.keys(r).find(
          (k) => k && k.toLowerCase().trim() === h.toLowerCase()
        );
        row[h] = found ? r[found] : r[h] ?? "";
      });
      return row;
    });
    addRowsFromParsed(normalized);
  };
  reader.readAsBinaryString(file);
}

export function exportCsv(rows, minMax) {
  const cols = [
    "Depth",
    "TotalGas",
    ...COMPONENT_KEYS,
    "SumUnits",
    "TotalGas(%)",
    "Status",
    "Flag",
  ];
  const lines = [cols.join(",")];
  rows.forEach((r) => {
    const tg = Number(r.input.TotalGas || 0);
    let flag = "";
    if (tg === minMax.max) flag = "MAX";
    if (tg === minMax.min) flag = "MIN";

    const values = [
      r.input.Depth ?? "",
      r.input.TotalGas ?? "",
      ...COMPONENT_KEYS.map((k) => r.input[k] ?? ""),
      (r.results.sumUnits || 0).toFixed(6),
      (r.results.percent || 0).toFixed(6),
      r.results.ok ? "GOOD" : "BAD",
      flag,
    ];
    lines.push(values.join(","));
  });
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  saveAs(blob, "gc_check_results.csv");
}
