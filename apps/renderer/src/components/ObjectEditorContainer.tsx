import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompileError, CompileObjectRequest, ObjectSourceTab, SourceDetail } from "@gavadb/types";
import { useToastContext } from "../hooks/ToastContext";
import { ObjectEditorHeader } from "./ObjectEditorHeader";
import { SqlCodeEditor, type SqlCodeEditorHandle } from "./SqlCodeEditor";
import type { ObjectNavigationTarget } from "./query-workspace/queryWorkspaceTypes";

interface ObjectEditorContainerProps {
  detail: SourceDetail;
  connectionId: string | null;
  navTarget?: ObjectNavigationTarget | null;
}

interface EditableSourceTabState extends ObjectSourceTab {
  initialSource: string;
  currentSource: string;
  compileErrors: CompileError[];
  compiling: boolean;
}

export function ObjectEditorContainer({ detail, connectionId, navTarget = null }: ObjectEditorContainerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<EditableSourceTabState[]>(() => createEditableTabs(detail.tabs));
  const [activeTabId, setActiveTabId] = useState(() => resolveDefaultActiveTabId(detail.tabs));
  const editorRef = useRef<SqlCodeEditorHandle | null>(null);
  const toast = useToastContext();

  useEffect(() => {
    setTabs(createEditableTabs(detail.tabs));
    setActiveTabId(resolveDefaultActiveTabId(detail.tabs));
  }, [detail]);

  // Navegação até um membro: troca para a parte alvo (ex.: body) e rola até a
  // linha da declaração. Roda também quando `detail` acaba de carregar (open
  // assíncrono) e a cada novo token (re-clique no mesmo membro). O rAF garante
  // que o CodeMirror já sincronizou o texto da parte ativa antes do focusLine.
  useEffect(() => {
    if (!navTarget) return;
    if (!tabs.some((tab) => tab.id === navTarget.part)) return;

    setActiveTabId(navTarget.part);
    const raf = requestAnimationFrame(() => {
      editorRef.current?.focusLine(navTarget.line);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTarget?.token, tabs]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  );
  const isPackageEditor = useMemo(
    () => tabs.some((tab) => tab.id === "spec") && tabs.some((tab) => tab.id === "body"),
    [tabs],
  );

  const updateActiveTab = (patch: Partial<EditableSourceTabState>) => {
    if (!activeTab) return;
    setTabs((current) => current.map((tab) => (tab.id === activeTab.id ? { ...tab, ...patch } : tab)));
  };

  const handleTogglePackagePart = useCallback(() => {
    setActiveTabId((current) => (current === "body" ? "spec" : "body"));
  }, []);

  const handleCompile = useCallback(async () => {
    if (!activeTab) return;

    updateActiveTab({ compiling: true });

    try {
      const request: CompileObjectRequest = {
        sql: activeTab.currentSource,
        objectType: activeTab.objectType,
        objectName: detail.objectName,
        connectionId,
      };
      const result = await window.gavadb.dbCompileObject(request);

      if (!result.success) {
        const message = result.error.details ? `${result.error.message}\n${result.error.details}` : result.error.message;
        updateActiveTab({
          compiling: false,
          compileErrors: [{ line: 0, position: 0, message }],
        });
        toast.error(result.error.message);
        return;
      }

      updateActiveTab({
        compiling: false,
        compileErrors: result.data.errors,
        initialSource: result.data.success ? activeTab.currentSource : activeTab.initialSource,
      });

      if (result.data.success) {
        toast.success("Object compiled successfully");
      } else {
        toast.error(`${result.data.errors.length} compilation error(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateActiveTab({
        compiling: false,
        compileErrors: [{ line: 0, position: 0, message }],
      });
      toast.error(message);
    }
  }, [activeTab, connectionId, detail.objectName, toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F9") return;
      if (!rootRef.current || rootRef.current.offsetParent === null) return;

      event.preventDefault();
      void handleCompile();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCompile]);

  if (!activeTab) {
    return (
      <div style={emptyStateStyle}>
        No source code available
      </div>
    );
  }

  const isDirty = activeTab.currentSource !== activeTab.initialSource;
  const activePart = isPackageEditor
    ? activeTab.id === "spec"
      ? "spec"
      : "body"
    : null;
  return (
    <div ref={rootRef} style={rootStyle}>
      <ObjectEditorHeader
        isPackageEditor={isPackageEditor}
        activePart={activePart}
        isDirty={isDirty}
        compiling={activeTab.compiling}
        onTogglePackagePart={isPackageEditor ? handleTogglePackagePart : undefined}
        onCompile={() => void handleCompile()}
      />

      <div style={editorHostStyle}>
        <div style={editorFillStyle}>
          <SqlCodeEditor
            ref={editorRef}
            value={activeTab.currentSource}
            onChange={(value) => updateActiveTab({ currentSource: value })}
            placeholder="Source code"
            showScopeLines={false}
          />
        </div>
      </div>

      <ObjectCompileErrorPanel
        errors={activeTab.compileErrors}
        onSelect={(error) => editorRef.current?.focusLine(error.line, error.position)}
      />
    </div>
  );
}

function ObjectCompileErrorPanel({
  errors,
  onSelect,
}: {
  errors: CompileError[];
  onSelect: (error: CompileError) => void;
}) {
  if (errors.length === 0) {
    return (
      <div style={statusBarStyle}>
        No compilation errors
      </div>
    );
  }

  return (
    <div style={errorPanelStyle}>
      <div style={errorPanelHeaderStyle}>Compilation Errors</div>
      <div style={{ overflow: "auto" }}>
        {errors.map((error, index) => (
          <button
            key={`${error.line}:${error.position}:${index}`}
            onClick={() => onSelect(error)}
            style={errorItemStyle}
          >
            <span style={errorLocationStyle}>
              {error.line > 0 ? `L${error.line}:${error.position}` : "Compiler"}
            </span>
            <span style={errorMessageStyle}>{error.message}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function createEditableTabs(tabs: ObjectSourceTab[]): EditableSourceTabState[] {
  return tabs.map((tab) => ({
    ...tab,
    initialSource: tab.source,
    currentSource: tab.source,
    compileErrors: [],
    compiling: false,
  }));
}

function resolveDefaultActiveTabId(tabs: ObjectSourceTab[]): string | null {
  if (tabs.some((tab) => tab.id === "body")) {
    return "body";
  }
  return tabs[0]?.id ?? null;
}

const rootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
};

const editorHostStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
};

const editorFillStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  minWidth: 0,
  minHeight: 0,
};

const errorPanelStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border-subtle)",
  background: "var(--panel-bg)",
  maxHeight: 180,
  overflow: "hidden",
  minWidth: 0,
};

const errorPanelHeaderStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border-subtle)",
};

const errorItemStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "90px minmax(0, 1fr)",
  gap: 10,
  padding: "8px 12px",
  border: "none",
  borderBottom: "1px solid var(--border-subtle)",
  borderRadius: 0,
  background: "transparent",
  textAlign: "left",
};

const errorLocationStyle: React.CSSProperties = {
  color: "var(--warning)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  whiteSpace: "nowrap",
};

const errorMessageStyle: React.CSSProperties = {
  color: "var(--danger)",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const statusBarStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderTop: "1px solid var(--border-subtle)",
  color: "var(--text-muted)",
  fontSize: 11,
  background: "var(--panel-bg)",
  minWidth: 0,
};

const emptyStateStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-muted)",
  fontSize: 12,
  fontStyle: "italic",
};
