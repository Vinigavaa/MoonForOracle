import { forwardRef } from "react";
import type { DatabaseObjectType, WorkspaceReadFileResponse } from "@gavadb/types";
import {
  QueryWorkspace,
  type QueryWorkspaceHandle,
} from "./query-workspace/QueryWorkspace";

interface SqlEditorProps {
  isConnected: boolean;
  activeConnectionId?: string | null;
  hasPendingTransaction?: boolean;
  executeTriggerRef: React.MutableRefObject<(() => void) | null>;
}

export interface SqlEditorHandle {
  focus: () => void;
  openFile: (file: WorkspaceReadFileResponse) => void;
  openObject: (type: DatabaseObjectType, name: string) => void;
  openObjectSql: (type: DatabaseObjectType, name: string) => void;
  addTab: () => void;
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  {
    isConnected,
    activeConnectionId = null,
    hasPendingTransaction = false,
    executeTriggerRef,
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
    />
  );
});
