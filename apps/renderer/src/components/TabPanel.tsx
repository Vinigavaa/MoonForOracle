import type { ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  closable?: boolean;
}

interface TabPanelProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onTabClose?: (id: string) => void;
  children: ReactNode;
}

export function TabPanel({ tabs, activeTab, onTabChange, onTabClose, children }: TabPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div style={{
        height: "var(--tab-height)",
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        alignItems: "stretch",
        background: "var(--tab-bar-bg)",
        borderBottom: "1px solid var(--border-color)",
        flexShrink: 0,
        overflowX: "auto",
        overflowY: "hidden",
      }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: "flex",
                flex: "0 0 auto",
                alignItems: "center",
                gap: 6,
                padding: "0 14px",
                background: isActive ? "var(--tab-active-bg)" : "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                borderRadius: 0,
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: "var(--font-size-sm)",
                fontWeight: isActive ? 500 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
              {tab.closable && onTabClose && (
                <span
                  onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                  style={{
                    marginLeft: 4,
                    fontSize: 14,
                    lineHeight: 1,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
