import { useState, useEffect, useCallback } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useSmartExplorer } from "../hooks/useSmartExplorer";
import { useAuth } from "../hooks/useAuth";
import "./SmartExplorer.css";

export function SmartExplorer() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { isAuthenticated } = useAuth();
  const { explore, status, count, error, reset } = useSmartExplorer();

  // Handle Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    if (!isAuthenticated) return;

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isAuthenticated]);

  // Handle dialog open/close changes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when dialog closes
      reset();
      setQuery("");
    }
  }, [reset, setQuery]);

  // Close dialog on success after a short delay
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        handleOpenChange(false);
      }, 2000); // Close after 2 seconds
      return () => clearTimeout(timer);
    }
  }, [status, handleOpenChange]);

  if (!isAuthenticated) {
    return null;
  }

  const handleExplore = () => {
    if (query.trim()) {
      explore(query.trim());
    }
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Smart Explorer"
    >
      <VisuallyHidden>
        <Dialog.Title>Smart Explorer</Dialog.Title>
      </VisuallyHidden>
      <Command.Input
        placeholder="Type a phrase to explore documents..."
        value={query}
        onValueChange={setQuery}
      />
      <Command.List>
        {status === "processing" && (
          <Command.Loading>Exploring...</Command.Loading>
        )}

        {status === "success" && count !== null && (
          <div style={{ padding: "1rem", textAlign: "center", color: "#22c55e" }}>
            ✓ Added {count} {count === 1 ? "document" : "documents"} to your board
          </div>
        )}

        {status === "error" && error && (
          <Command.Empty>
            <div style={{ padding: "1rem", textAlign: "center", color: "#dc2626" }}>
              Error: {error}
            </div>
          </Command.Empty>
        )}

        {status === "idle" && query.trim() && (
          <Command.Item onSelect={handleExplore}>
            Explore &apos;{query}&apos;
          </Command.Item>
        )}

        {status === "idle" && !query.trim() && (
          <Command.Empty>Type a phrase to explore documents</Command.Empty>
        )}

      </Command.List>
    </Command.Dialog>
  );
}
