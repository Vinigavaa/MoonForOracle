import { forwardRef } from "react";
import type { DatabaseObjectType, WorkspaceReadFileResponse } from "@gavadb/types";
import {
  QueryWorkspace,
  type QueryWorkspaceHandle,
  type QueryWorkspaceViewState,
} from "./query-workspace/QueryWorkspace";

interface SqlEditorProps {
  isConnected: boolean;
  activeConnectionId?: string | null;
  hasPendingTransaction?: boolean;
  executeTriggerRef: React.MutableRefObject<(() => void) | null>;
  executeAllTriggerRef: React.MutableRefObject<(() => void) | null>;
  onOpenObject: (type: DatabaseObjectType, name: string) => void;
  onWorkspaceStateChange?: (state: QueryWorkspaceViewState) => void;
}

export interface SqlEditorHandle {
  focus: () => void;
  openFile: (file: WorkspaceReadFileResponse) => void;
  selectTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  addTab: () => void;
  startTabDrag: (tabId: string) => void;
  endTabDrag: () => void;
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  {
    isConnected,
    activeConnectionId = null,
    hasPendingTransaction = false,
    executeTriggerRef,
    executeAllTriggerRef,
    onOpenObject,
    onWorkspaceStateChange,
  },
  ref,
) {
  return (
    <QueryWorkspace
      ref={ref as React.Ref<QueryWorkspaceHandle>}
      isConnected={isConnected}
      activeConnectionId={activeConnectionId}
      hasPendingTransaction={hasPendingTransaction}
      executeTriggerRef={executeTriggerRef}
      executeAllTriggerRef={executeAllTriggerRef}
      onOpenObject={onOpenObject}
      onWorkspaceStateChange={onWorkspaceStateChange}
    />
  );
});
