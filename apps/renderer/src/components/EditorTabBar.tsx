import { useState, type CSSProperties, type DragEventHandler } from "react";

export interface EditorTabBarItem {
  id: string;
  label: string;
  title?: string;
  closable?: boolean;
  busy?: boolean;
  pending?: boolean;
  dimmed?: boolean;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragEnd?: DragEventHandler<HTMLButtonElement>;
}

interface EditorTabBarProps {
  tabs: EditorTabBarItem[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose?: (id: string) => void;
  onAddTab?: () => void;
  addButtonTitle?: string;
  tabMinWidth?: number;
  /** "rounded" usa o visual de aba arredondada no topo (abas de query). */
  appearance?: "underline" | "rounded";
}

export function EditorTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onAddTab,
  addButtonTitle = "Nova Query",
  tabMinWidth,
  appearance = "underline",
}: EditorTabBarProps) {
  const isRounded = appearance === "rounded";
  const [addButtonHovered, setAddButtonHovered] = useState(false);

  return (
    <div style={isRounded ? roundedTabBarStyle : tabBarStyle}>
      <div style={isRounded ? roundedTabListStyle : tabListStyle}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.title ?? tab.label}
              draggable={tab.draggable}
              onClick={() => onTabSelect(tab.id)}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1 && tab.closable && onTabClose) {
                  event.preventDefault();
                  onTabClose(tab.id);
                }
              }}
              onDragStart={tab.onDragStart}
              onDragEnd={tab.onDragEnd}
              style={isRounded ? {
                ...roundedTabButtonStyle,
                minWidth: tabMinWidth ?? roundedTabButtonStyle.minWidth,
                background: isActive ? ROUNDED_TAB_ACTIVE_BG : "transparent",
                color: isActive
                  ? ROUNDED_TAB_ACTIVE_TEXT
                  : ROUNDED_TAB_DIM,
                opacity: tab.dimmed && !isActive ? 0.82 : 1,
              } : {
                ...tabButtonStyle,
                minWidth: tabMinWidth ?? tabButtonStyle.minWidth,
                background: isActive ? "var(--tab-active-bg)" : "transparent",
                borderBottomColor: isActive ? "var(--accent)" : "transparent",
                color: isActive
                  ? "var(--text-primary)"
                  : tab.dimmed
                    ? "var(--text-muted)"
                    : "var(--text-secondary)",
                opacity: tab.dimmed && !isActive ? 0.82 : 1,
              }}
            >
              <span style={tabLabelStyle}>{tab.label}</span>
              {tab.busy && (
                <span style={busyIndicatorStyle}>...</span>
              )}
              {tab.pending && (
                <span style={pendingIndicatorStyle} />
              )}
              {tab.closable && onTabClose && (
                <span
                  onClick={(event) => {
                    event.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  style={isRounded ? roundedCloseButtonStyle : closeButtonStyle}
                >
                  {"\u00D7"}
                </span>
              )}
            </button>
          );
        })}

        {onAddTab && (
          <button
            type="button"
            onClick={onAddTab}
            title={addButtonTitle}
            aria-label={addButtonTitle}
            onMouseEnter={isRounded ? () => setAddButtonHovered(true) : undefined}
            onMouseLeave={isRounded ? () => setAddButtonHovered(false) : undefined}
            style={isRounded ? {
              ...roundedAddButtonStyle,
              background: addButtonHovered ? ROUNDED_ADD_HOVER_BG : "transparent",
            } : addButtonStyle}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

const tabBarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "stretch",
  minHeight: 34,
  background: "var(--tab-bar-bg)",
  borderBottom: "1px solid var(--border-color)",
  flexShrink: 0,
  overflow: "hidden",
};

const tabListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "stretch",
  minWidth: 0,
  flex: 1,
  overflowX: "auto",
  overflowY: "hidden",
};

const tabButtonStyle: CSSProperties = {
  display: "flex",
  flex: "0 0 auto",
  alignItems: "center",
  gap: 6,
  minWidth: 96,
  maxWidth: 220,
  padding: "0 12px",
  border: "none",
  borderBottom: "2px solid transparent",
  borderRadius: 0,
  background: "transparent",
  fontSize: 11,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const tabLabelStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const busyIndicatorStyle: CSSProperties = {
  color: "var(--warning)",
  fontSize: 10,
  flexShrink: 0,
};

const pendingIndicatorStyle: CSSProperties = {
  width: 7,
  height: 7,
  background: "var(--status-pending)",
  flexShrink: 0,
};

const closeButtonStyle: CSSProperties = {
  marginLeft: 2,
  color: "var(--text-muted)",
  fontSize: 13,
  lineHeight: 1,
  cursor: "pointer",
  flexShrink: 0,
};

// ─── Variante "rounded" (abas de query) ─────────────────────────────
// Geometria fixa da especificação de design; cores saem do tema editável.

const ROUNDED_TAB_ACTIVE_BG = "var(--tab-active-bg)";
const ROUNDED_TAB_ACTIVE_TEXT = "var(--text-primary)";
const ROUNDED_TAB_DIM = "var(--text-muted)";
const ROUNDED_TAB_BORDER = "var(--border-color)";
const ROUNDED_ADD_HOVER_BG = "var(--hover-bg)";

const roundedTabBarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "center",
  height: 44,
  padding: "0 10px",
  gap: 4,
  background: "var(--tab-bar-bg)",
  borderBottom: `1px solid ${ROUNDED_TAB_BORDER}`,
  flexShrink: 0,
  overflow: "hidden",
};

const roundedTabListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "center",
  gap: 4,
  minWidth: 0,
  flex: 1,
  overflowX: "auto",
  overflowY: "hidden",
};

const roundedTabButtonStyle: CSSProperties = {
  display: "flex",
  flex: "0 0 auto",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  maxWidth: 220,
  padding: "8px 14px",
  border: "none",
  borderRadius: "10px 10px 0 0",
  background: "transparent",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const roundedCloseButtonStyle: CSSProperties = {
  color: ROUNDED_TAB_DIM,
  fontSize: 13,
  lineHeight: 1,
  cursor: "pointer",
  flexShrink: 0,
};

const roundedAddButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  width: 30,
  height: 30,
  padding: 0,
  border: "none",
  borderRadius: 9,
  background: "transparent",
  color: ROUNDED_TAB_DIM,
  fontSize: 16,
  fontWeight: 500,
  lineHeight: 1,
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const addButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  border: "none",
  borderRadius: 0,
  minWidth: 28,
  padding: "0 8px",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 16,
  fontWeight: 500,
  lineHeight: 1,
  flexShrink: 0,
  whiteSpace: "nowrap",
};
