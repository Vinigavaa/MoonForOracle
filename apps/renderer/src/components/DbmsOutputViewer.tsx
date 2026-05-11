import { memo, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { DbmsOutputLine } from "@gavadb/types";

interface DbmsOutputViewerProps {
  lines: DbmsOutputLine[];
}

export const DbmsOutputViewer = memo(function DbmsOutputViewer({ lines }: DbmsOutputViewerProps) {
  const [copying, setCopying] = useState(false);
  const text = useMemo(() => lines.map((entry) => entry.line).join("\n"), [lines]);

  const handleCopy = async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(text);
    } finally {
      window.setTimeout(() => setCopying(false), 800);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <span style={toolbarInfoStyle}>
          {lines.length} line{lines.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={() => void handleCopy()} style={buttonStyle}>
          {copying ? "Copied" : "Copy"}
        </button>
      </div>
      <div style={scrollStyle}>
        <pre style={contentStyle}>{text}</pre>
      </div>
    </div>
  );
});

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  background: "var(--result-viewer-bg)",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "6px 12px",
  borderBottom: "1px solid var(--border-color)",
  background: "var(--panel-bg)",
  flexShrink: 0,
};

const toolbarInfoStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
};

const buttonStyle: CSSProperties = {
  padding: "3px 10px",
  fontSize: 11,
  background: "var(--button-secondary-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius)",
  color: "var(--button-secondary-text)",
};

const scrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: 12,
  background: "var(--grid-bg)",
};

const contentStyle: CSSProperties = {
  margin: 0,
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--font-size-sm)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  userSelect: "text",
};
