import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DatabaseObjectType, WorkspaceReadFileResponse } from "@gavadb/types";
import { generateId } from "@gavadb/utils";
import { loadQueryWorkspacePreferences, saveQueryWorkspacePreferences } from "../../lib/queryWorkspacePreferences";
import { QueryEditorGroup, type QueryEditorGroupHandle } from "./QueryEditorGroup";
import { SplitResizeHandle } from "./SplitResizeHandle";
import {
  createDefaultQueryWorkspaceState,
  createQueryTab,
  type EditorGroup,
  type QueryDropPosition,
  type QueryTabDragData,
  type QueryTabState,
  type QueryWorkspaceState,
} from "./queryWorkspaceTypes";

const MIN_GROUP_WIDTH = 320;

interface QueryWorkspaceProps {
  isConnected: boolean;
  activeConnectionId: string | null;
  hasPendingTransaction: boolean;
  executeTriggerRef: React.MutableRefObject<(() => void) | null>;
  executeAllTriggerRef: React.MutableRefObject<(() => void) | null>;
  onOpenObject: (type: DatabaseObjectType, name: string) => void;
}

export interface QueryWorkspaceHandle {
  focus: () => void;
  openFile: (file: WorkspaceReadFileResponse) => void;
}

export const QueryWorkspace = forwardRef<QueryWorkspaceHandle, QueryWorkspaceProps>(function QueryWorkspace(
  {
    isConnected,
    activeConnectionId,
    hasPendingTransaction,
    executeTriggerRef,
    executeAllTriggerRef,
    onOpenObject,
  },
  ref,
) {
  const [workspace, setWorkspace] = useState<QueryWorkspaceState>(() => (
    loadQueryWorkspacePreferences(activeConnectionId) ?? createDefaultQueryWorkspaceState(activeConnectionId)
  ));
  const [dragState, setDragState] = useState<QueryTabDragData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, QueryEditorGroupHandle | null>>({});

  useEffect(() => {
    saveQueryWorkspacePreferences(workspace);
  }, [workspace]);

  const resolvedActiveGroupId = workspace.activeGroupId ?? workspace.groups[0]?.id ?? null;

  useEffect(() => {
    if (hasPendingTransaction) return;

    setWorkspace((prev) => {
      let changed = false;
      const groups = prev.groups.map((group) => {
        let groupChanged = false;
        const tabs = group.tabs.map((tab) => {
          if (!tab.hasPendingTransaction) return tab;
          changed = true;
          groupChanged = true;
          return { ...tab, hasPendingTransaction: false };
        });
        return groupChanged ? { ...group, tabs } : group;
      });

      return changed ? { ...prev, groups } : prev;
    });
  }, [hasPendingTransaction]);

  const focusGroup = useCallback((groupId: string | null) => {
    if (!groupId) return;
    window.requestAnimationFrame(() => {
      groupRefs.current[groupId]?.focus();
    });
  }, []);

  const activateGroup = useCallback((groupId: string) => {
    setWorkspace((prev) => (
      prev.activeGroupId === groupId ? prev : { ...prev, activeGroupId: groupId }
    ));
  }, []);

  const updateTab = useCallback((groupId: string, tabId: string, patch: Partial<QueryTabState>) => {
    setWorkspace((prev) => ({
      ...prev,
      groups: prev.groups.map((group) => (
        group.id === groupId
          ? {
            ...group,
            tabs: group.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
          }
          : group
      )),
    }));
  }, []);

  const updateGroup = useCallback((groupId: string, patch: Partial<EditorGroup>) => {
    setWorkspace((prev) => ({
      ...prev,
      groups: prev.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    }));
  }, []);

  const handleAddTab = useCallback((groupId: string) => {
    const tab = createQueryTab(activeConnectionId);
    setWorkspace((prev) => ({
      ...prev,
      activeGroupId: groupId,
      groups: prev.groups.map((group) => (
        group.id === groupId
          ? {
            ...group,
            activeTabId: tab.id,
            tabs: [...group.tabs, tab],
          }
          : group
      )),
    }));
    focusGroup(groupId);
  }, [activeConnectionId, focusGroup]);

  const handleAddTabToActiveGroup = useCallback(() => {
    const targetGroupId = resolvedActiveGroupId ?? workspace.groups[0]?.id ?? null;
    if (!targetGroupId) return;
    handleAddTab(targetGroupId);
  }, [handleAddTab, resolvedActiveGroupId, workspace.groups]);

  const handleSelectTab = useCallback((groupId: string, tabId: string) => {
    setWorkspace((prev) => ({
      ...prev,
      activeGroupId: groupId,
      groups: prev.groups.map((group) => (
        group.id === groupId ? { ...group, activeTabId: tabId } : group
      )),
    }));
  }, []);

  const handleCloseTab = useCallback((groupId: string, tabId: string) => {
    let nextFocusGroupId: string | null = null;

    setWorkspace((prev) => {
      const group = prev.groups.find((item) => item.id === groupId);
      if (!group) return prev;
      if (group.tabs.length <= 1 && prev.groups.length === 1) return prev;

      const nextGroups: EditorGroup[] = [];

      for (const current of prev.groups) {
        if (current.id !== groupId) {
          nextGroups.push(current);
          continue;
        }

        const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
        if (nextTabs.length === 0) {
          continue;
        }

        nextGroups.push({
          ...current,
          activeTabId: getNextActiveTabId(current.tabs, nextTabs, current.activeTabId, tabId),
          tabs: nextTabs,
        });
      }

      const normalized = normalizeWorkspaceState({
        ...prev,
        groups: nextGroups,
        activeGroupId: prev.activeGroupId === groupId && nextGroups.every((item) => item.id !== groupId)
          ? nextGroups[0]?.id ?? null
          : prev.activeGroupId,
      }, activeConnectionId);

      nextFocusGroupId = normalized.activeGroupId;
      return normalized;
    });

    focusGroup(nextFocusGroupId);
  }, [activeConnectionId, focusGroup]);

  const openFile = useCallback((file: WorkspaceReadFileResponse) => {
    let focusTargetGroupId: string | null = null;

    setWorkspace((prev) => {
      for (const group of prev.groups) {
        const existing = group.tabs.find((tab) => tab.filePath === file.path);
        if (existing) {
          focusTargetGroupId = group.id;
          return {
            ...prev,
            activeGroupId: group.id,
            groups: prev.groups.map((current) => (
              current.id === group.id ? { ...current, activeTabId: existing.id } : current
            )),
          };
        }
      }

      const targetGroupId = prev.activeGroupId ?? prev.groups[0]?.id;
      if (!targetGroupId) return prev;

      const tab = createQueryTab(activeConnectionId, {
        sql: file.content,
        filePath: file.path,
      });
      focusTargetGroupId = targetGroupId;

      return {
        ...prev,
        activeGroupId: targetGroupId,
        groups: prev.groups.map((group) => (
          group.id === targetGroupId
            ? { ...group, activeTabId: tab.id, tabs: [...group.tabs, tab] }
            : group
        )),
      };
    });

    focusGroup(focusTargetGroupId);
  }, [activeConnectionId, focusGroup]);

  const handleTabDrop = useCallback((payload: QueryTabDragData, targetGroupId: string, position: QueryDropPosition) => {
    let nextFocusGroupId: string | null = null;

    setWorkspace((prev) => {
      const sourceGroup = prev.groups.find((group) => group.id === payload.sourceGroupId);
      const targetGroup = prev.groups.find((group) => group.id === targetGroupId);
      const movingTab = sourceGroup?.tabs.find((tab) => tab.id === payload.tabId);

      if (!sourceGroup || !targetGroup || !movingTab) {
        return prev;
      }

      if (position === "center") {
        if (payload.sourceGroupId === targetGroupId) {
          nextFocusGroupId = targetGroupId;
          return { ...prev, activeGroupId: targetGroupId };
        }

        const groups = prev.groups.map((group) => {
          if (group.id === payload.sourceGroupId) {
            const nextTabs = group.tabs.filter((tab) => tab.id !== payload.tabId);
            if (nextTabs.length === 0) {
              return null;
            }
            return {
              ...group,
              activeTabId: getNextActiveTabId(group.tabs, nextTabs, group.activeTabId, payload.tabId),
              tabs: nextTabs,
            };
          }

          if (group.id === targetGroupId) {
            return {
              ...group,
              activeTabId: movingTab.id,
              tabs: [...group.tabs, movingTab],
            };
          }

          return group;
        }).filter((group): group is EditorGroup => group !== null);

        const normalized = normalizeWorkspaceState({
          ...prev,
          groups,
          activeGroupId: targetGroupId,
        }, activeConnectionId);
        nextFocusGroupId = normalized.activeGroupId;
        return normalized;
      }

      if (prev.groups.length > 1) {
        return prev;
      }

      const sourceTabs = sourceGroup.tabs.filter((tab) => tab.id !== payload.tabId);
      const fallbackTab = sourceTabs.length === 0 ? createQueryTab(activeConnectionId) : null;
      const nextSourceTabs = fallbackTab ? [fallbackTab] : sourceTabs;
      const nextSourceGroup: EditorGroup = {
        ...sourceGroup,
        activeTabId: fallbackTab
          ? fallbackTab.id
          : getNextActiveTabId(sourceGroup.tabs, nextSourceTabs, sourceGroup.activeTabId, payload.tabId),
        tabs: nextSourceTabs,
      };

      const newGroup: EditorGroup = {
        id: generateId(),
        activeTabId: movingTab.id,
        tabs: [movingTab],
        resultSplitRatio: sourceGroup.resultSplitRatio,
      };

      const nextGroups = [nextSourceGroup, newGroup];

      const normalized = normalizeWorkspaceState({
        ...prev,
        mode: "side-by-side",
        groups: nextGroups,
        activeGroupId: newGroup.id,
        groupSplitRatio: 0.5,
      }, activeConnectionId);

      nextFocusGroupId = newGroup.id;
      return normalized;
    });

    setDragState(null);
    focusGroup(nextFocusGroupId);
  }, [activeConnectionId, focusGroup]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!containerRef.current || containerRef.current.offsetParent === null) {
        return;
      }

      const isMod = navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey;
      if (!isMod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "n") {
        return;
      }

      event.preventDefault();
      handleAddTabToActiveGroup();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleAddTabToActiveGroup]);

  executeTriggerRef.current = () => {
    const activeGroupId = resolvedActiveGroupId;
    if (!activeGroupId) return;
    groupRefs.current[activeGroupId]?.executeActive();
  };

  executeAllTriggerRef.current = () => {
    const activeGroupId = resolvedActiveGroupId;
    if (!activeGroupId) return;
    groupRefs.current[activeGroupId]?.executeAll();
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      focusGroup(resolvedActiveGroupId);
    },
    openFile,
  }), [focusGroup, openFile, resolvedActiveGroupId]);

  const groups = workspace.groups;
  const isSplit = workspace.mode === "side-by-side" && groups.length > 1;
  const renderGroup = (group: EditorGroup, index: number) => {
    const isActiveGroup = resolvedActiveGroupId === group.id;
    const isFirst = index === 0;
    const primaryFlex = isSplit && isFirst ? `0 0 ${workspace.groupSplitRatio * 100}%` : 1;

    return (
      <div
        key={group.id}
        style={{
          flex: primaryFlex,
          minWidth: MIN_GROUP_WIDTH,
          minHeight: 0,
          minInlineSize: 0,
          minBlockSize: 0,
        }}
      >
        <QueryEditorGroup
          ref={(instance) => {
            groupRefs.current[group.id] = instance;
          }}
          group={group}
          groupCount={groups.length}
          isActive={isActiveGroup}
          isConnected={isConnected}
          activeConnectionId={activeConnectionId}
          dragState={dragState}
          allowSplitCreation={groups.length === 1}
          onActivateGroup={() => activateGroup(group.id)}
          onTabSelect={(tabId) => handleSelectTab(group.id, tabId)}
          onTabClose={(tabId) => handleCloseTab(group.id, tabId)}
          onAddTab={() => handleAddTab(group.id)}
          onUpdateTab={(tabId, patch) => updateTab(group.id, tabId, patch)}
          onResultSplitRatioChange={(ratio) => updateGroup(group.id, { resultSplitRatio: ratio })}
          onTabDrop={(payload, position) => handleTabDrop(payload, group.id, position)}
          onDragStart={setDragState}
          onDragEnd={() => setDragState(null)}
          onOpenObject={onOpenObject}
        />
      </div>
    );
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          flexDirection: "row",
          background: "var(--panel-bg)",
        }}
      >
        {!isSplit && renderGroup(groups[0], 0)}

        {isSplit && groups[0] && groups[1] && (
          <>
            {renderGroup(groups[0], 0)}
            <SplitResizeHandle
              axis="horizontal"
              containerRef={containerRef}
              minPrimarySize={MIN_GROUP_WIDTH}
              minSecondarySize={MIN_GROUP_WIDTH}
              onChange={(ratio) => setWorkspace((prev) => ({ ...prev, groupSplitRatio: ratio }))}
            />
            {renderGroup(groups[1], 1)}
          </>
        )}
      </div>
    </div>
  );
});

function normalizeWorkspaceState(workspace: QueryWorkspaceState, connectionId: string | null): QueryWorkspaceState {
  const groups = workspace.groups
    .filter((group) => group.tabs.length > 0)
    .slice(0, 2)
    .map((group) => ({
      ...group,
      activeTabId: group.tabs.some((tab) => tab.id === group.activeTabId) ? group.activeTabId : group.tabs[0]?.id ?? null,
    }));

  if (groups.length === 0) {
    return createDefaultQueryWorkspaceState(connectionId);
  }

  return {
    ...workspace,
    groups,
    mode: groups.length === 1
      ? "single"
      : "side-by-side",
    activeGroupId: groups.some((group) => group.id === workspace.activeGroupId)
      ? workspace.activeGroupId
      : groups[0].id,
    groupSplitRatio: clampRatio(workspace.groupSplitRatio),
  };
}

function getNextActiveTabId(
  previousTabs: QueryTabState[],
  nextTabs: QueryTabState[],
  activeTabId: string | null,
  removedTabId: string,
): string | null {
  if (nextTabs.length === 0) return null;
  if (activeTabId !== removedTabId) {
    return nextTabs.some((tab) => tab.id === activeTabId) ? activeTabId : nextTabs[0].id;
  }

  const removedIndex = previousTabs.findIndex((tab) => tab.id === removedTabId);
  return nextTabs[Math.min(removedIndex, nextTabs.length - 1)]?.id ?? nextTabs[0].id;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.2, Math.min(value, 0.8));
}
