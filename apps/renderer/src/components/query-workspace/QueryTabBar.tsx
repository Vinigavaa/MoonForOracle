import { memo, useMemo } from "react";
import { getFileName, type QueryTabDragData, type QueryTabState } from "./queryWorkspaceTypes";

interface QueryTabBarProps {
  groupId: string;
  tabs: QueryTabState[];
  activeTabId: string | null;
  isGroupActive: boolean;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onAddTab: () => void;
  onDragStart: (payload: QueryTabDragData) => void;
  onDragEnd: () => void;
}

export const QueryTabBar = memo(function QueryTabBar({
  groupId,
  tabs,
  activeTabId,
  isGroupActive,
  onTabSelect,
  onTabClose,
  onAddTab,
  onDragStart,
  onDragEnd,
}: QueryTabBarProps) {
  const displayTabs = useMemo(
    () => tabs.map((tab, index) => ({
      ...tab,
      title: tab.filePath ? getFileName(tab.filePath) : `Query ${index + 1}`,
    })),
    [tabs],
  );

  return (
    <div style={tabBarStyle}>
      <div style={{ display: "flex", alignItems: "stretch", minWidth: 0, overflow: "hidden", flex: 1 }}>
        {displayTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              draggable
              onClick={() => onTabSelect(tab.id)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tab.id);
                onDragStart({ tabId: tab.id, sourceGroupId: groupId });
              }}
              onDragEnd={onDragEnd}
              style={{
                ...tabButtonStyle,
                background: isActive ? "var(--tab-active-bg)" : "transparent",
                borderBottomColor: isActive ? "var(--accent)" : "transparent",
                color: isActive
                  ? "var(--text-primary)"
                  : isGroupActive
                    ? "var(--text-secondary)"
                    : "var(--text-muted)",
                opacity: isGroupActive || isActive ? 1 : 0.86,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tab.title}</span>
              {(tab.executing || tab.loadingMore || tab.sorting) && (
                <span style={{ color: "var(--warning)", fontSize: 10 }}>...</span>
              )}
              {(tab.hasPendingTransaction || tab.mutating) && (
                <span style={{ width: 7, height: 7, background: "var(--status-pending)", flexShrink: 0 }} />
              )}
              {displayTabs.length > 1 && (
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
      </div>

      <button
        onClick={onAddTab}
        title="Nova Query"
        aria-label="Nova Query"
        style={addButtonStyle}
      >
        +
      </button>
    </div>
  );
});

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 0,
  minHeight: 32,
  background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0))",
  borderBottom: "1px solid var(--border-subtle)",
  flexShrink: 0,
};

const tabButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  maxWidth: 220,
  padding: "0 12px",
  border: "none",
  borderBottom: "2px solid transparent",
  borderRadius: 0,
  fontSize: 11,
  lineHeight: 1,
  whiteSpace: "nowrap",
  background: "transparent",
};

const closeButtonStyle: React.CSSProperties = {
  marginLeft: 2,
  color: "var(--text-muted)",
  fontSize: 13,
  lineHeight: 1,
  cursor: "pointer",
  flexShrink: 0,
};

const addButtonStyle: React.CSSProperties = {
  border: "none",
  borderLeft: "1px solid var(--border-subtle)",
  borderRadius: 0,
  minWidth: 34,
  padding: "0 12px",
  background: "rgba(137, 180, 250, 0.08)",
  color: "var(--accent)",
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1,
  flexShrink: 0,
};
