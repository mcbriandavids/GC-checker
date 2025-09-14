import "../modal.css";
export const Modal = ({
  type,
  message,
  onConfirm,
  onCancel,
  pasteText,
  setPasteText,
}) => {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle} className="modal-enter">
        {/* Paste Modal */}
        {type === "paste" && (
          <>
            <h3>{message}</h3>
            <textarea
              style={{ width: "100%", height: "120px", marginTop: "10px" }}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div style={{ marginTop: "10px", textAlign: "right" }}>
              <button onClick={onConfirm} style={okButtonStyle}>
                ✅ OK
              </button>
              <button onClick={onCancel} style={cancelButtonStyle}>
                ❌ Cancel
              </button>
            </div>
          </>
        )}

        {/* Confirm Modal */}
        {type === "confirm" && (
          <>
            <p>{message}</p>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "space-around",
              }}
            >
              <button onClick={onConfirm} style={okButtonStyle}>
                ✅ Yes
              </button>
              <button onClick={onCancel} style={cancelButtonStyle}>
                ❌ No
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 🎨 Styles
const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalStyle = {
  background: "white",
  padding: 24,
  borderRadius: 8,
  textAlign: "center",
  width: 400,
};

const okButtonStyle = {
  padding: "8px 16px",
  background: "#4caf50",
  color: "white",
  border: "none",
  borderRadius: 4,
  marginRight: "8px",
};

const cancelButtonStyle = {
  padding: "8px 16px",
  background: "#f44336",
  color: "white",
  border: "none",
  borderRadius: 4,
};
