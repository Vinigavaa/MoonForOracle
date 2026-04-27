import { forwardRef } from "react";
import type { DatabaseObjectType, WorkspaceReadFileResponse } from "@gavadb/types";
import { QueryWorkspace, type QueryWorkspaceHandle } from "./query-workspace/QueryWorkspace";

interface SqlEditorProps {
  isConnected: boolean;
  activeConnectionId?: string | null;
  hasPendingTransaction?: boolean;
  executeTriggerRef: React.MutableRefObject<(() => void) | null>;
  executeAllTriggerRef: React.MutableRefObject<(() => void) | null>;
  onOpenObject: (type: DatabaseObjectType, name: string) => void;
}

export interface SqlEditorHandle {
  focus: () => void;
  openFile: (file: WorkspaceReadFileResponse) => void;
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  {
    isConnected,
    activeConnectionId = null,
    hasPendingTransaction = false,
    executeTriggerRef,
    executeAllTriggerRef,
    onOpenObject,
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
    />
  );
});
