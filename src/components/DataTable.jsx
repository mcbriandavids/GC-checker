import { COMPONENT_KEYS } from "../utils/constants";

export const DataTable = ({ rows, normalizeRow, convertDepth }) => {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        textAlign: "center",
        fontSize: "12px",
      }}
    >
      <thead>
        <tr>
          <th style={{ border: "1px solid #ccc", padding: "4px" }}>Depth</th>
          <th style={{ border: "1px solid #ccc", padding: "4px" }}>
            TotalGas (%)
          </th>
          <th style={{ border: "1px solid #ccc", padding: "4px" }}>
            TotalGas (u)
          </th>
          {COMPONENT_KEYS.map((k) => (
            <th key={k} style={{ border: "1px solid #ccc", padding: "4px" }}>
              {k}
            </th>
          ))}
          <th style={{ border: "1px solid #ccc", padding: "4px" }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ border: "1px solid #ccc" }}>
            <td style={{ border: "1px solid #ccc", padding: "4px" }}>
              {convertDepth(r.input.Depth)}
            </td>
            <td style={{ border: "1px solid #ccc", padding: "4px" }}>
              {r.results.percent.toFixed(2)}
            </td>
            <td style={{ border: "1px solid #ccc", padding: "4px" }}>
              {r.input.TotalGas.toFixed(2)}
            </td>
            {COMPONENT_KEYS.map((k) => (
              <td key={k} style={{ border: "1px solid #ccc", padding: "4px" }}>
                {r.input[k].toFixed(2)}
              </td>
            ))}
            <td
              style={{
                border: "1px solid #ccc",
                padding: "4px",
                cursor: "pointer",
              }}
              onClick={() => normalizeRow(r.id)}
            >
              {r.normalized ? "✔" : "X"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
