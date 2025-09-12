import { useState, useRef, useEffect } from "react";
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

22222222222222222222222222222222222222222222222222222222222222222222;
import { HEADERS } from "../utils/constants.js";

export const DataTable = ({
  rows,
  updateCell,
  removeRow,
  normalizeRow,
  depthUnit,
  convertDepth,
}) => {
  return (
    <table border="1" cellPadding="4" style={{ width: "100%", marginTop: 12 }}>
      <thead>
        <tr>
          {HEADERS.map((h) => (
            <th key={h}>{h}</th>
          ))}
          <th>Sum %</th>
          <th>Sum (u)</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {HEADERS.map((h) => (
              <td key={h}>
                <input
                  type="number"
                  value={
                    h === "Depth"
                      ? convertDepth(row.input[h])
                      : row.input[h] !== ""
                      ? Number(row.input[h]).toFixed(2)
                      : ""
                  }
                  onChange={(e) => updateCell(row.id, h, e.target.value)}
                  disabled={row.normalized}
                />
              </td>
            ))}

            {/* Sum percent */}
            <td>{row.results.percent.toFixed(2)}%</td>

            {/* Sum units */}
            <td>{row.results.sumUnits.toFixed(2)}</td>

            {/* Actions */}
            <td>
              <button
                onClick={() => normalizeRow(row.id)}
                disabled={row.normalized}
              >
                Normalize
              </button>
              <button
                onClick={() => removeRow(row.id)}
                disabled={row.normalized}
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

333333333333333333333333333333333333333;
import React, { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

import { HEADERS, COMPONENT_KEYS } from "./utils/constants.js";
import { parseTextToRows } from "./utils/parser.js";
import { computeRow } from "./utils/calculator.js";
import { exportCsv } from "./utils/exporter.js";

import { Notification } from "./components/Notification.jsx";
import { Controls } from "./components/Controls.jsx";
import { DataTable } from "./components/DataTable.jsx";

export const App = () => {
  const [rows, setRows] = useState(() => {
    const stored = localStorage.getItem("gcRows");
    return stored ? JSON.parse(stored) : [];
  });
  const [overLimit, setOverLimit] = useState(false);
  const [minMax, setMinMax] = useState({ min: null, max: null });
  const [maxGasRow, setMaxGasRow] = useState(null);
  const [notification, setNotification] = useState(null);
  const [depthUnit, setDepthUnit] = useState("m"); // "m" = meters, "ft" = feet
  const fileRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("gcRows", JSON.stringify(rows));

    if (rows.length === 0) {
      setMinMax({ min: null, max: null });
      setMaxGasRow(null);
      setOverLimit(false);
      return;
    }

    const totalGasValues = rows.map((r) => Number(r.input.TotalGas || 0));
    const min = Math.min(...totalGasValues);
    const max = Math.max(...totalGasValues);
    setMinMax({ min, max });
    setOverLimit(totalGasValues.some((v) => v > 100));

    const maxRow = rows.find((r) => Number(r.input.TotalGas || 0) === max);
    setMaxGasRow(maxRow || null);
  }, [rows]);

  const showNotification = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const convertDepth = (value) => {
    if (!value) return "0.00";
    const num = Number(value);
    if (isNaN(num)) return "0.00";
    return depthUnit === "ft" ? (num * 3.28084).toFixed(2) : num.toFixed(2);
  };

  // --- Handlers ---
  const handlePaste = () => {
    const text = prompt("Paste your GC data here:");
    handleManualPaste(text);
  };

  const handleManualPaste = (text) => {
    if (!text || typeof text !== "string") {
      showNotification("No valid text to parse", "error");
      return;
    }
    const trimmedText = text.trim();
    if (!trimmedText) {
      showNotification("Empty data", "error");
      return;
    }
    const parsedRows = parseTextToRows(trimmedText);
    if (parsedRows.length > 0) {
      addRowsFromParsed(parsedRows);
    } else {
      showNotification("No valid data found", "error");
    }
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      handleManualPaste(csv);
    };
    reader.readAsArrayBuffer(file);
  };

  const addRowsFromParsed = (parsed) => {
    const computed = parsed.map((r, idx) => ({
      id: Date.now() + idx,
      input: r,
      results: computeRow(r),
      normalized: false,
    }));
    setRows((prev) => [...prev, ...computed]);
  };

  const addEmptyRow = () => {
    const empty = {
      id: Date.now(),
      input: COMPONENT_KEYS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {
        Depth: 0,
        TotalGas: 0,
      }),
      results: computeRow(
        COMPONENT_KEYS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {
          Depth: 0,
          TotalGas: 0,
        })
      ),
      normalized: false,
    };
    setRows((prev) => [...prev, empty]);
  };

  const updateCell = (id, key, value) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              input: { ...r.input, [key]: value },
              results: computeRow({ ...r.input, [key]: value }),
            }
          : r
      )
    );
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const normalizeRow = (id) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, normalized: true } : r))
    );
  };

  return (
    <div className="container" style={{ padding: 8, position: "relative" }}>
      <h2>GC Balance Checker</h2>

      {/* Depth Unit Toggle */}
      <div style={{ marginBottom: "8px" }}>
        <label>Depth Unit: </label>
        <select
          value={depthUnit}
          onChange={(e) => setDepthUnit(e.target.value)}
        >
          <option value="m">Meters (m)</option>
          <option value="ft">Feet (ft)</option>
        </select>
      </div>

      {/* Notification */}
      {notification && (
        <Notification
          message={notification.msg}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* TotalGas Over Limit */}
      {overLimit && (
        <div
          style={{ background: "#ff5722", color: "#fff", padding: "4px 8px" }}
        >
          TotalGas &gt; 100
        </div>
      )}

      {/* Max Gas Navbar */}
      {maxGasRow && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            background: "#4caf50",
            color: "white",
            padding: "10px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: "bold",
            zIndex: 999,
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          <span>
            Max Gas = {Number(maxGasRow.input.TotalGas || 0).toFixed(2)} u
          </span>
          <span>
            Depth = {convertDepth(maxGasRow.input.Depth)} {depthUnit}
          </span>
          <span>
            Breakdown:{" "}
            {COMPONENT_KEYS.map(
              (k) => `${k} = ${Number(maxGasRow.input[k] || 0).toFixed(2)}`
            ).join(", ")}
          </span>
        </div>
      )}

      <Controls
        fileRef={fileRef}
        onManualPaste={handlePaste}
        onFile={handleFile}
        onAddRow={addEmptyRow}
        onExport={() => exportCsv(rows, minMax, depthUnit)}
        onClear={() => setRows([])}
      />

      <DataTable
        rows={rows}
        minMax={minMax}
        updateCell={updateCell}
        removeRow={removeRow}
        normalizeRow={normalizeRow}
        depthUnit={depthUnit}
        convertDepth={convertDepth}
      />
    </div>
  );
};
