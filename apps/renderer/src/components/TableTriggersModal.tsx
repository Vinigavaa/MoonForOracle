import { useEffect } from "react";
import type { TableTriggerInfo } from "@gavadb/types";

interface TableTriggersModalProps {
  tableName: string;
  triggers: TableTriggerInfo[];
  onSelect: (triggerName: string) => void;
  onClose: () => void;
}

/**
 * Popup do botão TRIGGERS da tela de detalhe de tabela.
 * Lista as triggers da tabela; selecionar uma abre o objeto em uma aba,
 * do mesmo jeito que packages/procedures.
 */
export function TableTriggersModal({ tableName, triggers, onSelect, onClose }: TableTriggersModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={(event) => event.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <span style={modalTitleStyle}>{`Triggers · ${tableName}`}</span>
          <button type="button" onClick={onClose} style={iconButtonStyle} title="Close">
            {"✕"}
          </button>
        </div>

        <div style={modalBodyStyle}>
          {triggers.length === 0 && <div style={emptyStyle}>No triggers on this table</div>}

          {triggers.map((trigger) => (
            <button
              key={trigger.name}
              type="button"
              onClick={() => onSelect(trigger.name)}
              style={triggerRowStyle}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, textAlign: "left" }}>
                <span style={triggerNameStyle}>{trigger.name}</span>
                <span style={triggerEventStyle}>{trigger.event}</span>
              </span>
              <span style={trigger.status === "ENABLED" ? enabledPillStyle : disabledPillStyle}>
                {trigger.status}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: 560,
  maxWidth: "calc(100% - 40px)",
  maxHeight: "70vh",
  display: "flex",
  flexDirection: "column",
  borderRadius: 16,
  background: "var(--modal-bg)",
  border: "1px solid var(--border-color)",
  overflow: "hidden",
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  flexShrink: 0,
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "var(--text-title)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const iconButtonStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 7,
  border: "1px solid var(--border-color)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 12,
  lineHeight: 1,
  flexShrink: 0,
};

const modalBodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 12,
  overflow: "auto",
  minHeight: 0,
};

const triggerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-surface)",
  width: "100%",
};

const triggerNameStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const triggerEventStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
};

const statusPillBaseStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const enabledPillStyle: React.CSSProperties = {
  ...statusPillBaseStyle,
  background: "var(--selected-bg)",
  color: "var(--success)",
};

const disabledPillStyle: React.CSSProperties = {
  ...statusPillBaseStyle,
  background: "var(--selected-bg)",
  color: "var(--danger)",
};

const emptyStyle: React.CSSProperties = {
  padding: "14px 12px",
  fontSize: 12,
  fontStyle: "italic",
  color: "var(--text-muted)",
};
