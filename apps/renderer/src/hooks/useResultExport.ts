import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BindParameterValue,
  QueryExportColumn,
  QueryExportFormat,
  QueryExportProgress,
} from "@gavadb/types";

interface ExportRequestInput {
  sql: string;
  binds?: Record<string, BindParameterValue>;
  orderBy?: { column: string; direction: "asc" | "desc" };
  columns: QueryExportColumn[];
  format: QueryExportFormat;
  delimiter?: string;
  suggestedFileName?: string;
  autoFitColumns?: boolean;
}

interface ExportState {
  inProgress: boolean;
  progress: QueryExportProgress | null;
}

export function useResultExport() {
  const activeExportIdRef = useRef<string | null>(null);
  const [state, setState] = useState<ExportState>({
    inProgress: false,
    progress: null,
  });

  useEffect(() => {
    return window.gavadb.onExportProgress((progress) => {
      if (progress.exportId !== activeExportIdRef.current) return;
      setState({ inProgress: progress.stage !== "completed" && progress.stage !== "error", progress });
    });
  }, []);

  const exportResult = useCallback(async (request: ExportRequestInput) => {
    const exportId = crypto.randomUUID();
    activeExportIdRef.current = exportId;
    setState({
      inProgress: true,
      progress: {
        exportId,
        format: request.format,
        stage: "preparing",
        rowsProcessed: 0,
        chunksProcessed: 0,
        message: "Preparing export...",
      },
    });

    const response = await window.gavadb.dbExportQueryResult({
      exportId,
      sql: request.sql,
      binds: request.binds,
      orderBy: request.orderBy,
      columns: request.columns,
      format: request.format,
      delimiter: request.delimiter,
      suggestedFileName: request.suggestedFileName,
      autoFitColumns: request.autoFitColumns,
    });

    if (!response.success) {
      setState((current) => ({
        inProgress: false,
        progress: current.progress
          ? { ...current.progress, stage: "error", message: response.error.message }
          : null,
      }));
      return { error: response.error.message };
    }

    setState((current) => ({
      inProgress: false,
      progress: current.progress
        ? {
          ...current.progress,
          stage: "completed",
          rowsProcessed: response.data.rowsExported,
          filePath: response.data.filePath,
          message: response.data.canceled
            ? "Export canceled."
            : `Export completed with ${response.data.rowsExported.toLocaleString()} row(s).`,
        }
        : null,
    }));

    return { data: response.data };
  }, []);

  const clearProgress = useCallback(() => {
    setState({ inProgress: false, progress: null });
    activeExportIdRef.current = null;
  }, []);

  return {
    exportResult,
    exportInProgress: state.inProgress,
    exportProgress: state.progress,
    clearExportProgress: clearProgress,
  };
}
