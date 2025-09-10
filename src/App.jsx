import React, { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const HEADERS = [
  "Depth",
  "TotalGas",
  "C1",
  "C2",
  "C3",
  "iC4",
  "nC4",
  "iC5",
  "nC5",
];
const COMPONENT_KEYS = ["C1", "C2", "C3", "iC4", "nC4", "iC5", "nC5"];
const PPM_PER_UNIT = 200;
const TOLERANCE_FRACTION = 0.01;

function parseTextToRows(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const delim = lines[0].includes("\t")
    ? "\t"
    : lines[0].includes(",")
    ? ","
    : /\s+/;
  const cells = lines.map((l) =>
    l.split(delim).map((s) => s.replace(/^["']|["']$/g, "").trim())
  );
  const firstIsHeader = isNaN(Number(cells[0][0]));
  const parsed = [];
  if (firstIsHeader) {
    const headerRow = cells[0].map((h) => h.trim());
    for (let i = 1; i < cells.length; i++) {
      const row = {};
      HEADERS.forEach((key, idx) => {
        const findIdx = headerRow.findIndex(
          (h) => h && h.toLowerCase() === key.toLowerCase()
        );
        const val = findIdx >= 0 ? cells[i][findIdx] : cells[i][idx];

        // Depth stays as string, others numeric
        if (key === "Depth") {
          row[key] = val ?? "";
        } else {
          row[key] = val === "" ? "" : Number(val);
        }
      });
      parsed.push(row);
    }
  } else {
    for (const r of cells) {
      const row = {};
      HEADERS.forEach((key, idx) => {
        if (key === "Depth") {
          row[key] = r[idx] ?? "";
        } else {
          row[key] =
            r[idx] === undefined || r[idx] === "" ? "" : Number(r[idx]);
        }
      });
      parsed.push(row);
    }
  }
  return parsed;
}

function computeRow(row) {
  const compUnits = {};
  let sumUnits = 0;
  for (const key of COMPONENT_KEYS) {
    const ppm = Number(row[key] || 0);
    const units = ppm / PPM_PER_UNIT;
    compUnits[key] = units;
    sumUnits += units;
  }
  const reported = Number(row.TotalGas || 0);
  const ok =
    Math.abs(sumUnits - reported) <= Math.abs(reported) * TOLERANCE_FRACTION;
  const totalPpm = reported * PPM_PER_UNIT;
  const percent = totalPpm / 10000;
  return { compUnits, sumUnits, ok, percent };
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [overLimit, setOverLimit] = useState(false);
  const [minMax, setMinMax] = useState({ min: null, max: null });
  const fileRef = useRef(null);

  // Update overLimit indicator whenever rows change
  useEffect(() => {
    const anyOver = rows.some((r) => Number(r.input.TotalGas || 0) > 100);
    setOverLimit(anyOver);

    if (rows.length > 0) {
      const values = rows.map((r) => Number(r.input.TotalGas || 0));
      const min = Math.min(...values);
      const max = Math.max(...values);
      setMinMax({ min, max });
    }
  }, [rows]);

  function addRowsFromParsed(parsed) {
    // Enforce Depth requirement
    for (let row of parsed) {
      if (!row.Depth) {
        alert("Depth must be added for all rows!");
        return;
      }
    }

    const newRows = parsed.map((r, i) => {
      const input = {};
      HEADERS.forEach(
        (k) =>
          (input[k] = r[k] === "" || r[k] === undefined ? "" : Number(r[k]))
      );
      return { id: Date.now() + i, input, results: computeRow(input) };
    });
    setRows((prev) => [...prev, ...newRows]);
  }

  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    addRowsFromParsed(parseTextToRows(text));
  }

  function handleManualPaste() {
    const text = window.prompt(
      "Paste rows (tab/comma/space-delimited). Header optional:"
    );
    if (!text) return;
    addRowsFromParsed(parseTextToRows(text));
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const normalized = res.data.map((r) => {
            const row = {};
            HEADERS.forEach((h) => {
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
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const normalized = json.map((r) => {
          const row = {};
          HEADERS.forEach((h) => {
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
    } else {
      alert("Please upload a .csv or .xlsx/.xls file");
    }
    e.target.value = null;
  }

  function updateCell(rowId, key, value) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const input = { ...r.input, [key]: value === "" ? "" : Number(value) };
        return { ...r, input, results: computeRow(input) };
      })
    );
  }

  function removeRow(rowId) {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }

  function addEmptyRow() {
    const input = {};
    HEADERS.forEach((h) => (input[h] = ""));
    setRows((prev) => [
      ...prev,
      { id: Date.now(), input, results: computeRow(input) },
    ]);
  }

  function normalizeRow(rowId) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const sumUnits = r.results.sumUnits;
        if (sumUnits === 0) return r;
        const factor = Number(r.input.TotalGas || 0) / sumUnits;
        const newInput = { ...r.input };
        COMPONENT_KEYS.forEach((k) => {
          const oldPpm = Number(r.input[k] || 0);
          newInput[k] = Number((oldPpm * factor).toFixed(6));
        });
        return { ...r, input: newInput, results: computeRow(newInput) };
      })
    );
  }

  function exportCsv() {
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

  return (
    <div
      className="container"
      onPaste={handlePaste}
      style={{
        fontFamily: "Arial, sans-serif",
        padding: 8,
        position: "relative",
      }}
    >
      <h2 style={{ marginBottom: 8 }}>GC Balance Checker</h2>

      {/* Indicator */}
      {overLimit && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "6px 12px",
            background: "#ff5722",
            color: "#fff",
            fontWeight: "bold",
            borderRadius: 4,
            boxShadow: "0 0 6px #ff5722",
            animation: "pulse 1s infinite",
          }}
        >
          TotalGas &gt; 100
        </div>
      )}

      <div style={{ marginBottom: 6, fontSize: 14, fontWeight: "bold" }}>
        {minMax.min !== null && minMax.max !== null && (
          <>
            Min TotalGas: {minMax.min} | Max TotalGas: {minMax.max}
          </>
        )}
      </div>

      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}
      </style>

      <div className="controls" style={{ marginBottom: 4 }}>
        <button onClick={handleManualPaste} style={{ marginRight: 4 }}>
          Paste rows
        </button>
        <label style={{ display: "inline-block", marginRight: 4 }}>
          <input
            type="file"
            ref={fileRef}
            accept=".csv,.xlsx,.xls"
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <button onClick={() => fileRef.current.click()}>
            Upload CSV / Excel
          </button>
        </label>
        <button onClick={addEmptyRow} style={{ marginRight: 4 }}>
          Add row
        </button>
        <button onClick={exportCsv} style={{ marginRight: 4 }}>
          Export CSV
        </button>
        <button onClick={() => setRows([])}>Clear</button>
      </div>

      <div
        style={{
          overflow: "auto",
          maxHeight: "600px",
          border: "1px solid #ccc",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "#1976d2",
              color: "#fff",
              zIndex: 1,
            }}
          >
            <tr>
              <th style={{ border: "1px solid #999", padding: 4 }}>#</th>
              <th style={{ border: "1px solid #999", padding: 4 }}>
                Depth (m)
              </th>
              <th style={{ border: "1px solid #999", padding: 4 }}>
                TotalGas (u)
              </th>
              {COMPONENT_KEYS.map((k) => (
                <th key={k} style={{ border: "1px solid #999", padding: 4 }}>
                  {k} (ppm)
                </th>
              ))}
              <th style={{ border: "1px solid #999", padding: 4 }}>Sum (u)</th>
              <th style={{ border: "1px solid #999", padding: 4 }}>
                TotalGas (%)
              </th>
              <th style={{ border: "1px solid #999", padding: 4 }}>Status</th>
              <th style={{ border: "1px solid #999", padding: 4 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={12}
                  style={{ padding: 12, textAlign: "center", color: "#64748b" }}
                >
                  No rows yet — paste data or upload CSV/Excel.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => {
              const ok = r.results.ok;
              const tg = Number(r.input.TotalGas || 0);
              const isMax = tg === minMax.max;
              const isMin = tg === minMax.min;
              const bgColor = ok ? "#4caf50" : "#f44336";
              const textColor = "#fff";
              return (
                <tr
                  key={r.id}
                  style={{
                    background: bgColor,
                    color: textColor,
                    fontWeight: isMax || isMin ? "bold" : "normal",
                  }}
                >
                  <td style={{ padding: 4, textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ padding: 4 }}>
                    <input
                      value={r.input.Depth ?? ""}
                      onChange={(e) =>
                        updateCell(r.id, "Depth", e.target.value)
                      }
                      style={{ width: 70, fontSize: 12 }}
                    />
                  </td>
                  <td style={{ padding: 4 }}>
                    <input
                      value={r.input.TotalGas ?? ""}
                      onChange={(e) =>
                        updateCell(r.id, "TotalGas", e.target.value)
                      }
                      style={{ width: 70, fontSize: 12 }}
                    />
                    {isMax && <div style={{ fontSize: 10 }}>MAX</div>}
                    {isMin && <div style={{ fontSize: 10 }}>MIN</div>}
                  </td>
                  {COMPONENT_KEYS.map((k) => (
                    <td key={k} style={{ padding: 2 }}>
                      <input
                        value={r.input[k] ?? ""}
                        onChange={(e) => updateCell(r.id, k, e.target.value)}
                        style={{ width: 60, fontSize: 12 }}
                      />
                      <div style={{ fontSize: 10 }}>
                        {(r.results.compUnits[k] || 0).toFixed(4)} u
                      </div>
                    </td>
                  ))}
                  <td style={{ fontWeight: 700, padding: 4 }}>
                    {(r.results.sumUnits || 0).toFixed(4)}
                  </td>
                  <td style={{ padding: 4 }}>
                    {(r.results.percent || 0).toFixed(4)}%
                  </td>
                  <td
                    style={{ padding: 4, textAlign: "center", fontWeight: 800 }}
                  >
                    {r.results.ok ? "GOOD" : "BAD"}
                  </td>
                  <td style={{ padding: 4 }}>
                    <button
                      onClick={() => removeRow(r.id)}
                      style={{ marginRight: 4 }}
                    >
                      Remove
                    </button>
                    <button onClick={() => normalizeRow(r.id)}>
                      Normalize
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
