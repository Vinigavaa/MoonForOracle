import type { CSSProperties, DragEventHandler } from "react";

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
}

export function EditorTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onAddTab,
  addButtonTitle = "Nova Query",
  tabMinWidth,
}: EditorTabBarProps) {
  return (
    <div style={tabBarStyle}>
      <div style={tabListStyle}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.title ?? tab.label}
              draggable={tab.draggable}
              onClick={() => onTabSelect(tab.id)}
              onDragStart={tab.onDragStart}
              onDragEnd={tab.onDragEnd}
              style={{
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
                  style={closeButtonStyle}
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
            style={addButtonStyle}
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
