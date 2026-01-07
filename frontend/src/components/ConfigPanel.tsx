import { useState } from "react";
import { useAnimation } from "../contexts/AnimationContext";
import { driveApi } from "../api/drive";

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
          gap: "16px",
          padding: "6px 14px",
          backgroundColor: "white",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          border: "1px solid #e2e8f0",
          pointerEvents: "all",
        }}
      >
        <AddLifeToggle />
        <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0" }} />
        <SyncDriveButton />
      </div>
    </div>
  );
}

function SyncDriveButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSync = async () => {
    setIsSyncing(true);
    setStatus("idle");
    try {
      await driveApi.syncGoogleDrive();
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      console.error("Sync failed:", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        backgroundColor: status === "error" ? "#fee2e2" : status === "success" ? "#dcfce7" : "#f8fafc",
        border: `1px solid ${status === "error" ? "#f87171" : status === "success" ? "#4ade80" : "#e2e8f0"}`,
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: 600,
        color: status === "error" ? "#991b1b" : status === "success" ? "#166534" : "#475569",
        cursor: isSyncing ? "wait" : "pointer",
        transition: "all 0.2s",
        outline: "none",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animation: isSyncing ? "spin 2s linear infinite" : "none" }}
      >
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
      </svg>
      {isSyncing ? "Syncing..." : status === "success" ? "Sync Started" : status === "error" ? "Sync Failed" : "Sync Drive"}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
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

