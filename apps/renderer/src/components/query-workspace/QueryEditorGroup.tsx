import { forwardRef, memo, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import type { DatabaseObjectType } from "@gavadb/types";
import { EditorTabBar, type EditorTabBarItem } from "../EditorTabBar";
import { QueryEditorPane, type QueryEditorPaneHandle } from "./QueryEditorPane";
import type {
  EditorGroup,
  QueryDropPosition,
  QueryTabDragData,
  QueryTabState,
  QueryWorkspaceTabSummary,
} from "./queryWorkspaceTypes";

interface QueryEditorGroupProps {
  group: EditorGroup;
  groupCount: number;
  tabSummaries: QueryWorkspaceTabSummary[];
  isActive: boolean;
  isConnected: boolean;
  activeConnectionId: string | null;
  dragState: QueryTabDragData | null;
  allowSplitCreation: boolean;
  onActivateGroup: () => void;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onAddTab: () => void;
  onUpdateTab: (tabId: string, patch: Partial<QueryTabState>) => void;
  onResultSplitRatioChange: (ratio: number) => void;
  onTabDrop: (payload: QueryTabDragData, position: QueryDropPosition) => void;
  onDragStart: (payload: QueryTabDragData) => void;
  onDragEnd: () => void;
  onOpenObject: (type: DatabaseObjectType, name: string) => void;
}

export interface QueryEditorGroupHandle {
  focus: () => void;
  executeActive: () => void;
  executeAll: () => void;
}

export const QueryEditorGroup = memo(forwardRef<QueryEditorGroupHandle, QueryEditorGroupProps>(function QueryEditorGroup(
  {
    group,
    groupCount,
    tabSummaries,
    isActive,
    isConnected,
    activeConnectionId,
    dragState,
    allowSplitCreation,
    onActivateGroup,
    onTabSelect,
    onTabClose,
    onAddTab,
    onUpdateTab,
    onResultSplitRatioChange,
    onTabDrop,
    onDragStart,
    onDragEnd,
    onOpenObject,
  },
  ref,
) {
  const paneRef = useRef<QueryEditorPaneHandle | null>(null);
  const [hoveredDropPosition, setHoveredDropPosition] = useState<QueryDropPosition | null>(null);
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId) ?? group.tabs[0] ?? null;

  useImperativeHandle(ref, () => ({
    focus: () => {
      paneRef.current?.focus();
    },
    executeActive: () => {
      paneRef.current?.executeActive();
    },
    executeAll: () => {
      paneRef.current?.executeAll();
    },
  }), []);

  const showDropOverlay = dragState !== null;
  const dropZones: QueryDropPosition[] = allowSplitCreation
    ? ["center", "right"]
    : ["center"];
  const tabItems: EditorTabBarItem[] = tabSummaries.map((summary) => {
    const tab = group.tabs.find((item) => item.id === summary.id);
    return {
      id: summary.id,
      label: summary.label,
      title: tab?.filePath ?? summary.label,
      closable: summary.closable,
      busy: Boolean(tab?.executing || tab?.loadingMore || tab?.mutating || tab?.sorting),
      pending: Boolean(tab?.hasPendingTransaction),
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", summary.id);
        onDragStart({
          tabId: summary.id,
          sourceGroupId: group.id,
        });
      },
      onDragEnd: () => {
        onDragEnd();
      },
    };
  });

  return (
    <div
      onMouseDown={onActivateGroup}
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        position: "relative",
        background: "var(--panel-bg)",
        boxShadow: isActive
          ? "inset 0 0 0 1px rgba(137, 180, 250, 0.28)"
          : "inset 0 0 0 1px rgba(255, 255, 255, 0.02)",
      }}
    >
      <EditorTabBar
        tabs={tabItems}
        activeTabId={group.activeTabId}
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
        onAddTab={onAddTab}
        addButtonTitle="Nova Query"
        tabMinWidth={0}
      />

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {activeTab ? (
          <QueryEditorPane
            ref={paneRef}
            activeTab={activeTab}
            isConnected={isConnected}
            activeConnectionId={activeConnectionId}
            resultSplitRatio={group.resultSplitRatio}
            onResultSplitRatioChange={onResultSplitRatioChange}
            onUpdateTab={(tabId, patch) => onUpdateTab(tabId, patch)}
            onOpenObject={onOpenObject}
            onCloseActiveTab={() => {
              if (group.tabs.length > 1) {
                onTabClose(activeTab.id);
              }
            }}
          />
        ) : (
          <div style={{ flex: 1, minHeight: 0, background: "var(--panel-bg)" }} />
        )}

        {showDropOverlay && (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setHoveredDropPosition(null)}
            style={dropOverlayStyle}
          >
            {dropZones.map((position) => (
              <div
                key={position}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setHoveredDropPosition(position);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setHoveredDropPosition(position);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setHoveredDropPosition(null);
                  if (!dragState) return;
                  onTabDrop(dragState, position);
                }}
                style={getDropZoneStyle(position, hoveredDropPosition === position)}
              >
                <span style={dropLabelStyle}>{getDropZoneLabel(position, allowSplitCreation)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}));

const dropOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "auto",
  background: "rgba(15, 23, 42, 0.14)",
};

const dropLabelStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  background: "rgba(17, 17, 27, 0.88)",
  border: "1px solid rgba(137, 180, 250, 0.18)",
  padding: "3px 6px",
  pointerEvents: "none",
};

function getDropZoneLabel(position: QueryDropPosition, allowSplitCreation: boolean) {
  if (position === "center") return "Move";
  if (!allowSplitCreation) return "Move";
  if (position === "right") return "Split right";
  return "Move";
}

function getDropZoneStyle(position: QueryDropPosition, isHovered: boolean): CSSProperties {
  const activeBorder = isHovered ? "rgba(137, 180, 250, 0.9)" : "rgba(137, 180, 250, 0.2)";
  const activeBackground = isHovered ? "rgba(137, 180, 250, 0.18)" : "rgba(137, 180, 250, 0.08)";

  const base: CSSProperties = {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${activeBorder}`,
    background: activeBackground,
    transition: "background 120ms ease, border-color 120ms ease",
  };

  switch (position) {
    case "right":
      return { ...base, top: 16, bottom: 16, right: 16, width: "22%" };
    case "center":
    default:
      return { ...base, left: 16, right: "28%", top: 16, bottom: 16 };
  }
}
