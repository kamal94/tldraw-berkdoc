import { useAnimation } from "../contexts/AnimationContext";

export function ConfigPanel() {
  return (
    <div
      style={{
        position: "absolute",
        top: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none", // Allow clicking through to canvas unless on a button
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 14px",
          backgroundColor: "white",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          border: "1px solid #e2e8f0",
          pointerEvents: "all",
        }}
      >
        <AddLifeToggle />
      </div>
    </div>
  );
}

function AddLifeToggle() {
  const { isAddLifeEnabled, setIsAddLifeEnabled } = useAnimation();

  return (
    <label
      style={{
        fontSize: "13px",
        fontWeight: 600,
        color: "#4b5563",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        userSelect: "none",
      }}
    >
      <span>Add Life</span>
      <div
        onClick={() => setIsAddLifeEnabled(!isAddLifeEnabled)}
        style={{
          width: "38px",
          height: "22px",
          backgroundColor: isAddLifeEnabled ? "#4f46e5" : "#d1d5db",
          borderRadius: "11px",
          position: "relative",
          transition: "background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "18px",
            height: "18px",
            backgroundColor: "white",
            borderRadius: "50%",
            position: "absolute",
            top: "2px",
            left: isAddLifeEnabled ? "18px" : "2px",
            transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        />
      </div>
    </label>
  );
}

