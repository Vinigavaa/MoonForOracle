import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from "react";
import { countRender } from "../lib/perfLog";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { sql, PLSQL } from "@codemirror/lang-sql";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { search, searchKeymap } from "@codemirror/search";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { DatabaseObjectSuggestion, SearchColumnsRequest, SqlColumnSuggestion } from "@gavadb/types";
import { extractObjectReferenceAtCursor, type SqlObjectReference } from "@gavadb/utils";
import type { SqlEditorExecutionSnapshot } from "../lib/sqlExecutionTarget";
import { buildExecutionSnapshot } from "../lib/sqlExecutionTarget";
import type { EditorThemeConfig } from "../lib/editorTheme";
import { useEditorTheme } from "../hooks/EditorThemeContext";
import { sqlScopeExtension } from "../lib/sqlScopeExtension";
import { calculateAutocompleteTarget, replaceAutocompleteRange, resolveAutocompleteTarget, type SqlAutocompleteTarget } from "../lib/sqlAutocomplete";
import { detectSqlAutocompleteContext } from "../lib/sqlAutocompleteContext";

interface SqlCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onExecute?: () => void;
  onExecuteAll?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onCloseTab?: () => void;
  onOpenObject?: (name: string) => void | Promise<void>;
  onCanOpenObject?: (name: string) => Promise<boolean>;
  onSearchObjectsByPrefix?: (prefix: string, limit?: number) => Promise<DatabaseObjectSuggestion[]>;
  onSearchColumns?: (request: SearchColumnsRequest) => Promise<SqlColumnSuggestion[]>;
  onExecutionContextChange?: (snapshot: SqlEditorExecutionSnapshot) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  showScopeLines?: boolean;
}

interface AutocompleteState {
  open: boolean;
  loading: boolean;
  items: SqlAutocompleteItem[];
  sourceItems: SqlAutocompleteItem[];
  selectedIndex: number;
  query: string;
  top: number;
  left: number;
  target: SqlAutocompleteTarget | null;
  kind: "object" | "column" | null;
}

type SqlAutocompleteItem =
  | { kind: "object"; value: DatabaseObjectSuggestion }
  | { kind: "column"; value: SqlColumnSuggestion };

export interface SqlCodeEditorHandle {
  getExecutionSnapshot: () => SqlEditorExecutionSnapshot;
  focus: () => void;
  focusLine: (line: number, column?: number) => void;
}

// ─── Build CodeMirror theme from config ─────────────────────────────

// Geometria fixa do editor vinda da especificação de design.
// Cores e fonte continuam saindo do tema editável (EditorThemeConfig).
const SPEC_LINE_HEIGHT = "1.7";
const SPEC_GUTTER_WIDTH = 46;

function buildCmTheme(cfg: EditorThemeConfig) {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${cfg.fontSize}px`,
      fontFamily: cfg.fontFamily,
      background: cfg.bgEditor,
      color: cfg.textDefault,
    },
    // Sem padding vertical: o gutter do CodeMirror não acompanha o padding do
    // .cm-content nesta aplicação (mapa de alturas divergente das linhas reais),
    // então um padding-top aqui desloca todos os números em relação ao código.
    ".cm-content": {
      padding: "0 0 8px",
      caretColor: cfg.cursor,
      lineHeight: SPEC_LINE_HEIGHT,
      tabSize: "2",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: cfg.fontFamily,
      lineHeight: SPEC_LINE_HEIGHT,
    },
    ".cm-line": { padding: 0 },
    ".cm-sql-scope-gutter": {
      minWidth: "28px",
      borderRight: "1px solid transparent",
    },
    ".cm-sql-scope-gutter .cm-gutterElement": {
      padding: 0,
      width: "100%",
    },
    ".cm-sql-scope-gutter-marker": {
      position: "relative",
      height: "100%",
      minHeight: "1.6em",
      pointerEvents: "none",
    },
    ".cm-sql-scope-gutter-line": {
      position: "absolute",
      width: "1px",
      background: cfg.scopeLineColor,
      opacity: String(Math.max(0.1, Math.min(cfg.scopeLineOpacity, 0.6))),
      borderRadius: "999px",
      transform: "translateX(-0.5px)",
    },
    ".cm-sql-scope-gutter-line.is-active": {
      background: cfg.scopeLineColor,
      opacity: String(Math.max(0.22, Math.min(cfg.scopeLineOpacity + 0.18, 0.82))),
      width: "2px",
      transform: "translateX(-1px)",
    },
    ".cm-sql-scope-gutter-elbow": {
      position: "absolute",
      height: "1px",
      background: cfg.scopeLineColor,
      opacity: String(Math.max(0.1, Math.min(cfg.scopeLineOpacity, 0.6))),
      transform: "translateY(-0.5px)",
      borderRadius: "999px",
    },
    ".cm-sql-scope-gutter-elbow.is-active": {
      opacity: String(Math.max(0.22, Math.min(cfg.scopeLineOpacity + 0.18, 0.82))),
      height: "2px",
      transform: "translateY(-1px)",
    },
    ".cm-cursor": { borderLeftColor: cfg.cursor },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      background: `${cfg.selection} !important`,
    },
    // Gutter sem divisória: mesmo fundo da área de código, sem borderRight.
    // Sem padding vertical aqui — o CodeMirror já alinha o gutter ao padding
    // do .cm-content; duplicar desloca os números em relação às linhas.
    ".cm-gutters": {
      // bgEditor (não bgGutter) de propósito: a especificação pede que o gutter
      // se misture à área de código, então ele acompanha o fundo do editor.
      background: cfg.bgEditor,
      color: cfg.textPlaceholder,
      border: "none",
      userSelect: "none",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      width: `${SPEC_GUTTER_WIDTH}px`,
      minWidth: `${SPEC_GUTTER_WIDTH}px`,
      padding: "0 16px 0 0",
      textAlign: "right",
      lineHeight: SPEC_LINE_HEIGHT,
      userSelect: "none",
    },
    ".cm-activeLineGutter": {
      background: "transparent",
      color: cfg.cursor,
      fontWeight: "bold",
    },
    ".cm-activeLine": { background: cfg.activeLine },
    "&.cm-focused": { outline: "none" },
    ".cm-placeholder": { color: cfg.textPlaceholder },
    // Search panel styling
    ".cm-panels": {
      background: cfg.bgGutter,
      borderBottom: "1px solid var(--divider-color)",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid var(--divider-color)",
    },
    ".cm-search": {
      padding: "6px 10px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexWrap: "wrap",
      fontSize: `${cfg.fontSize - 1}px`,
    },
    ".cm-search input, .cm-search button": {
      fontSize: `${cfg.fontSize - 1}px`,
      fontFamily: "var(--font-ui)",
    },
    ".cm-search input": {
      background: cfg.bgEditor,
      color: cfg.textDefault,
      border: "1px solid var(--border-color)",
      borderRadius: "3px",
      padding: "2px 6px",
      outline: "none",
    },
    ".cm-search input:focus": {
      borderColor: cfg.cursor,
    },
    ".cm-search button": {
      background: "transparent",
      color: cfg.textDefault,
      border: "1px solid var(--border-color)",
      borderRadius: "3px",
      padding: "2px 8px",
      cursor: "pointer",
    },
    ".cm-search button:hover": {
      background: "var(--hover-bg)",
    },
    ".cm-search label": {
      color: cfg.textPlaceholder,
      fontSize: `${cfg.fontSize - 1}px`,
    },
    ".cm-searchMatch": {
      background: "var(--status-pending)",
      color: "var(--app-bg)",
      borderRadius: "2px",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      background: "var(--warning)",
      color: "var(--app-bg)",
    },
  }, { dark: cfg.baseTheme === "dark" });
}

function buildHighlightStyle(cfg: EditorThemeConfig) {
  return syntaxHighlighting(HighlightStyle.define([
    { tag: tags.keyword, color: cfg.textKeyword, fontWeight: "bold" },
    { tag: tags.operatorKeyword, color: cfg.textKeyword, fontWeight: "bold" },
    { tag: tags.controlKeyword, color: cfg.textKeyword, fontWeight: "bold" },
    { tag: tags.definitionKeyword, color: cfg.textKeyword, fontWeight: "bold" },
    { tag: tags.operator, color: cfg.textOperator },
    { tag: tags.string, color: cfg.textString },
    { tag: tags.number, color: cfg.textNumber },
    { tag: [tags.lineComment, tags.blockComment], color: cfg.textComment, fontStyle: "italic" },
    { tag: tags.typeName, color: cfg.textKeyword },
    { tag: tags.bool, color: cfg.textNumber },
    { tag: tags.null, color: cfg.danger, fontStyle: "italic" },
    { tag: tags.punctuation, color: cfg.textPunctuation },
    { tag: [tags.name, tags.variableName, tags.propertyName], color: cfg.textIdentifier },
  ]));
}

// ─── Go-to-line dialog ──────────────────────────────────────────────

function showGoToLineDialog(view: EditorView) {
  // Remove any existing dialog
  const existing = view.dom.querySelector(".cm-goto-line-dialog");
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "cm-goto-line-dialog";
  wrapper.style.cssText = `
    position: absolute; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px;
    background: var(--editor-gutter-bg);
    border-bottom: 1px solid var(--divider-color);
    font-size: 12px;
  `;

  const label = document.createElement("span");
  label.textContent = "Go to line:";
  label.style.color = "var(--text-placeholder)";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = String(view.state.doc.lines);
  input.placeholder = `1–${view.state.doc.lines}`;
  input.style.cssText = `
    width: 80px; padding: 2px 6px;
    background: var(--editor-bg);
    color: var(--editor-text);
    border: 1px solid var(--border-color);
    border-radius: 3px; font-size: 12px; outline: none;
  `;

  const close = () => { wrapper.remove(); view.focus(); };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const lineNum = parseInt(input.value, 10);
      if (lineNum >= 1 && lineNum <= view.state.doc.lines) {
        const line = view.state.doc.line(lineNum);
        view.dispatch({
          selection: { anchor: line.from },
          scrollIntoView: true,
        });
      }
      close();
    }
    if (e.key === "Escape") close();
  });

  wrapper.appendChild(label);
  wrapper.appendChild(input);

  // Position relative to the editor
  const scrollerEl = view.dom.querySelector(".cm-scroller");
  if (scrollerEl) {
    view.dom.insertBefore(wrapper, scrollerEl);
  } else {
    view.dom.prepend(wrapper);
  }
  input.focus();
}

// ─── Component ──────────────────────────────────────────────────────

export const SqlCodeEditor = memo(forwardRef<SqlCodeEditorHandle, SqlCodeEditorProps>(function SqlCodeEditor({
  value,
  onChange,
  onExecute,
  onExecuteAll,
  onSave,
  onSaveAs,
  onCloseTab,
  onOpenObject,
  onCanOpenObject,
  onSearchObjectsByPrefix,
  onSearchColumns,
  onExecutionContextChange,
  disabled,
  readOnly,
  placeholder,
  showScopeLines = true,
}, ref) {
  countRender("SqlCodeEditor");
  const { theme: themeConfig } = useEditorTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);
  const onExecuteAllRef = useRef(onExecuteAll);
  const onSaveRef = useRef(onSave);
  const onSaveAsRef = useRef(onSaveAs);
  const onCloseTabRef = useRef(onCloseTab);
  const onOpenObjectRef = useRef(onOpenObject);
  const onCanOpenObjectRef = useRef(onCanOpenObject);
  const onSearchObjectsByPrefixRef = useRef(onSearchObjectsByPrefix);
  const onSearchColumnsRef = useRef(onSearchColumns);
  const onExecutionContextChangeRef = useRef(onExecutionContextChange);
  const disabledRef = useRef(disabled);
  const readOnlyRef = useRef(readOnly || disabled);
  const editableCompartmentRef = useRef(new Compartment());
  const placeholderCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());
  const highlightCompartmentRef = useRef(new Compartment());
  const scopeCompartmentRef = useRef(new Compartment());
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const hoveredWordRef = useRef<string | null>(null);
  const lastMouseEventRef = useRef<MouseEvent | null>(null);
  const hoverValidationRequestRef = useRef(0);
  const openabilityCacheRef = useRef<Map<string, boolean>>(new Map());
  const openabilityPendingRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const parsedStatementsRef = useRef(buildExecutionSnapshot(value, 0, 0, 0).statements);
  const parsedDocRef = useRef(value);
  const parseTimeoutRef = useRef<number | null>(null);
  const autocompleteRequestRef = useRef(0);
  const autocompleteItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const autocompleteRef = useRef<AutocompleteState>({
    open: false,
    loading: false,
    items: [],
    sourceItems: [],
    selectedIndex: 0,
    query: "",
    top: 0,
    left: 0,
    target: null,
    kind: null,
  });
  const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
    open: false,
    loading: false,
    items: [],
    sourceItems: [],
    selectedIndex: 0,
    query: "",
    top: 0,
    left: 0,
    target: null,
    kind: null,
  });
  autocompleteRef.current = autocomplete;

  onChangeRef.current = onChange;
  onExecuteRef.current = onExecute;
  onExecuteAllRef.current = onExecuteAll;
  onSaveRef.current = onSave;
  onSaveAsRef.current = onSaveAs;
  onCloseTabRef.current = onCloseTab;
  onOpenObjectRef.current = onOpenObject;
  onCanOpenObjectRef.current = onCanOpenObject;
  onSearchObjectsByPrefixRef.current = onSearchObjectsByPrefix;
  onSearchColumnsRef.current = onSearchColumns;
  onExecutionContextChangeRef.current = onExecutionContextChange;
  disabledRef.current = disabled;
  readOnlyRef.current = readOnly || disabled;

  function getSelectionOffsets(state: EditorState) {
    const main = state.selection.main;
    return {
      selectionStart: main.from,
      selectionEnd: main.to,
      cursorOffset: main.head,
    };
  }

  function publishExecutionContext(view: EditorView, forceReparse = false): SqlEditorExecutionSnapshot {
    const document = view.state.doc.toString();
    const { selectionStart, selectionEnd, cursorOffset } = getSelectionOffsets(view.state);

    if (forceReparse || parsedDocRef.current !== document) {
      parsedStatementsRef.current = buildExecutionSnapshot(document, selectionStart, selectionEnd, cursorOffset).statements;
      parsedDocRef.current = document;
    }

    const snapshot = buildExecutionSnapshot(
      document,
      selectionStart,
      selectionEnd,
      cursorOffset,
      parsedStatementsRef.current,
    );

    onExecutionContextChangeRef.current?.(snapshot);
    return snapshot;
  }

  function scheduleParsedStatementsRefresh(view: EditorView) {
    if (parseTimeoutRef.current != null) {
      window.clearTimeout(parseTimeoutRef.current);
    }

    parseTimeoutRef.current = window.setTimeout(() => {
      parseTimeoutRef.current = null;
      publishExecutionContext(view, true);
    }, 300);
  }

  function closeAutocomplete() {
    autocompleteRequestRef.current += 1;
    setAutocomplete((current) => current.open ? {
      open: false,
      loading: false,
      items: [],
      sourceItems: [],
      selectedIndex: 0,
      query: "",
      top: 0,
      left: 0,
      target: null,
      kind: null,
    } : current);
  }

  function moveAutocompleteSelection(delta: number) {
    setAutocomplete((current) => {
      if (!current.open || current.items.length === 0) return current;
      const nextIndex = (current.selectedIndex + delta + current.items.length) % current.items.length;
      return { ...current, selectedIndex: nextIndex };
    });
  }

  function applyAutocompleteSuggestion(view: EditorView, item: SqlAutocompleteItem) {
    const currentAutocomplete = autocompleteRef.current;
    if (!currentAutocomplete.target) return;

    const cursor = view.state.selection.main.head;
    const document = view.state.doc.toString();
    const resolvedTarget = resolveAutocompleteTarget(document, cursor, currentAutocomplete.target);
    if (!resolvedTarget) {
      closeAutocomplete();
      return;
    }

    replaceAutocompleteRange(view, resolvedTarget, getAutocompleteInsertText(item));
    closeAutocomplete();
    publishExecutionContext(view, true);
    window.requestAnimationFrame(() => view.focus());
  }

  async function triggerPrefixAutocomplete(view: EditorView) {
    const objectSearchFn = onSearchObjectsByPrefixRef.current;
    const columnSearchFn = onSearchColumnsRef.current;
    if (!objectSearchFn || !columnSearchFn || disabledRef.current || readOnlyRef.current) {
      closeAutocomplete();
      return true;
    }

    const cursor = view.state.selection.main.head;
    const document = view.state.doc.toString();
    const target = calculateAutocompleteTarget(document, cursor, { allowEmptyPrefix: true });
    if (!target) {
      closeAutocomplete();
      return true;
    }

    const coords = view.coordsAtPos(target.anchor) ?? view.coordsAtPos(cursor);
    const containerRect = containerRef.current?.getBoundingClientRect();
    const left = coords && containerRect ? coords.left - containerRect.left : 12;
    const top = coords && containerRect ? coords.bottom - containerRect.top + 6 : 36;
    const context = detectSqlAutocompleteContext(document, cursor, target);
    if (context.kind === "object" && !target.prefix.text) {
      closeAutocomplete();
      return true;
    }

    const query = context.kind === "column" ? context.prefix : context.query;
    const requestId = ++autocompleteRequestRef.current;

    setAutocomplete({
      open: true,
      loading: true,
      items: [],
      sourceItems: [],
      selectedIndex: 0,
      query,
      top,
      left,
      target,
      kind: context.kind,
    });
    autocompleteItemRefs.current = [];

    try {
      const items = context.kind === "column"
        ? (await columnSearchFn({
          tables: context.tables,
          prefix: "",
          limit: 1000,
        })).map((value: SqlColumnSuggestion) => ({ kind: "column", value } satisfies SqlAutocompleteItem))
        : (await objectSearchFn(context.query, 20)).map((value: DatabaseObjectSuggestion) => ({ kind: "object", value } satisfies SqlAutocompleteItem));
      if (autocompleteRequestRef.current !== requestId) return true;

      setAutocomplete((current) => {
        if (!current.open || current.kind !== context.kind) return current;
        if (context.kind === "object" && current.query !== query) return current;
        const visibleItems = context.kind === "column" ? filterColumnAutocompleteItems(items, current.query) : items;
        return {
          ...current,
          loading: false,
          items: visibleItems,
          sourceItems: items,
          selectedIndex: 0,
        };
      });
    } catch {
      if (autocompleteRequestRef.current !== requestId) return true;
      setAutocomplete((current) => {
        if (!current.open || current.kind !== context.kind) return current;
        if (context.kind === "object" && current.query !== query) return current;
        return { ...current, loading: false, items: [], sourceItems: [], selectedIndex: 0 };
      });
    }

    return true;
  }

  function refreshObjectAutocompleteForDocument(view: EditorView): boolean {
    const currentAutocomplete = autocompleteRef.current;
    const objectSearchFn = onSearchObjectsByPrefixRef.current;
    if (!currentAutocomplete.open || currentAutocomplete.kind !== "object" || !currentAutocomplete.target) {
      return false;
    }
    if (!objectSearchFn || disabledRef.current || readOnlyRef.current) {
      closeAutocomplete();
      return true;
    }

    const cursor = view.state.selection.main.head;
    const document = view.state.doc.toString();
    const target = calculateAutocompleteTarget(document, cursor, { allowEmptyPrefix: true });
    if (!target) {
      closeAutocomplete();
      return true;
    }

    const context = detectSqlAutocompleteContext(document, cursor, target);
    if (context.kind !== "object") {
      closeAutocomplete();
      return true;
    }

    const coords = view.coordsAtPos(target.anchor) ?? view.coordsAtPos(cursor);
    const containerRect = containerRef.current?.getBoundingClientRect();
    const left = coords && containerRect ? coords.left - containerRect.left : currentAutocomplete.left;
    const top = coords && containerRect ? coords.bottom - containerRect.top + 6 : currentAutocomplete.top;
    const query = context.query;
    const requestId = ++autocompleteRequestRef.current;

    setAutocomplete((current) => {
      if (!current.open || current.kind !== "object") return current;
      return {
        ...current,
        loading: true,
        query,
        top,
        left,
        target,
        selectedIndex: 0,
      };
    });

    void objectSearchFn(query, 20)
      .then((results) => {
        if (autocompleteRequestRef.current !== requestId) return;
        const items = results.map((value: DatabaseObjectSuggestion) => ({ kind: "object", value } satisfies SqlAutocompleteItem));
        setAutocomplete((current) => {
          if (!current.open || current.kind !== "object" || current.query !== query) return current;
          return {
            ...current,
            loading: false,
            items,
            sourceItems: items,
            selectedIndex: 0,
          };
        });
      })
      .catch(() => {
        if (autocompleteRequestRef.current !== requestId) return;
        setAutocomplete((current) => {
          if (!current.open || current.kind !== "object" || current.query !== query) return current;
          return {
            ...current,
            loading: false,
            items: [],
            sourceItems: [],
            selectedIndex: 0,
          };
        });
      });

    return true;
  }

  function refreshColumnAutocompleteForDocument(view: EditorView): boolean {
    const currentAutocomplete = autocompleteRef.current;
    if (!currentAutocomplete.open || currentAutocomplete.kind !== "column" || !currentAutocomplete.target) {
      return false;
    }

    const cursor = view.state.selection.main.head;
    const document = view.state.doc.toString();
    const target = calculateAutocompleteTarget(document, cursor, { allowEmptyPrefix: true });
    if (!target || target.qualifier?.text !== currentAutocomplete.target.qualifier?.text) {
      closeAutocomplete();
      return true;
    }

    const query = target.prefix.text;
    const items = filterColumnAutocompleteItems(currentAutocomplete.sourceItems, query);
    setAutocomplete((current) => {
      if (!current.open || current.kind !== "column") return current;
      return {
        ...current,
        items,
        query,
        target,
        selectedIndex: Math.min(current.selectedIndex, Math.max(items.length - 1, 0)),
      };
    });
    return true;
  }

  useImperativeHandle(ref, () => ({
    getExecutionSnapshot: () => {
      const view = viewRef.current;
      if (!view) {
        return buildExecutionSnapshot(value, 0, 0, 0);
      }
      return publishExecutionContext(view, true);
    },
    focus: () => {
      viewRef.current?.focus();
    },
    focusLine: (line, column = 1) => {
      const view = viewRef.current;
      if (!view) return;

      const safeLine = Math.max(1, Math.min(line, view.state.doc.lines));
      const lineInfo = view.state.doc.line(safeLine);
      const safeColumn = Math.max(1, column);
      const position = Math.min(lineInfo.from + safeColumn - 1, lineInfo.to);

      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: "center" }),
      });
      view.focus();
    },
  }), [value]);

  function clearHoverFeedback() {
    const hovered = hoveredElementRef.current;
    if (hovered) {
      hovered.style.textDecoration = "";
      hovered.style.cursor = "";
    }
    hoveredElementRef.current = null;
    hoveredWordRef.current = null;
  }

  function applyHoverFeedback(target: HTMLElement, word: string) {
    if (hoveredElementRef.current !== target) {
      clearHoverFeedback();
      hoveredElementRef.current = target;
    }

    hoveredWordRef.current = word;
    target.style.textDecoration = "underline";
    target.style.cursor = "pointer";
  }

  function isModifierPressed(event: MouseEvent | KeyboardEvent) {
    return navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey;
  }

  function getObjectReferenceAtMouseEvent(view: EditorView, event: MouseEvent) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return null;
    return extractObjectReferenceAtCursor(view.state.doc.toString(), pos);
  }

  async function canOpenResolvedObject(name: string): Promise<boolean> {
    const resolver = onCanOpenObjectRef.current;
    if (!resolver) return true;

    const key = normalizeObjectLookupKey(name);
    const cached = openabilityCacheRef.current.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const pending = openabilityPendingRef.current.get(key);
    if (pending) {
      return pending;
    }

    const request = resolver(name)
      .then((result) => {
        const allowed = Boolean(result);
        openabilityCacheRef.current.set(key, allowed);
        openabilityPendingRef.current.delete(key);
        return allowed;
      })
      .catch(() => {
        openabilityCacheRef.current.set(key, false);
        openabilityPendingRef.current.delete(key);
        return false;
      });

    openabilityPendingRef.current.set(key, request);
    return request;
  }

  async function updateHoverFeedback(event: MouseEvent) {
    const view = viewRef.current;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!view || !target || disabledRef.current || readOnlyRef.current || !isModifierPressed(event)) {
      hoverValidationRequestRef.current += 1;
      clearHoverFeedback();
      return;
    }

    const objectRef = getObjectReferenceAtMouseEvent(view, event);
    if (!objectRef) {
      hoverValidationRequestRef.current += 1;
      clearHoverFeedback();
      return;
    }

    const requestId = ++hoverValidationRequestRef.current;
    const canOpen = await canOpenResolvedObject(objectRef.text);
    if (requestId !== hoverValidationRequestRef.current) {
      return;
    }
    if (!canOpen) {
      clearHoverFeedback();
      return;
    }

    applyHoverFeedback(target, objectRef.text);
  }

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      keymap.of([
        {
          key: "Ctrl-s",
          mac: "Cmd-s",
          run: () => { onSaveRef.current?.(); return true; },
        },
        {
          key: "Shift-Ctrl-s",
          mac: "Shift-Cmd-s",
          run: () => { onSaveAsRef.current?.(); return true; },
        },
        {
          key: "Ctrl-Enter",
          mac: "Cmd-Enter",
          run: () => { onExecuteRef.current?.(); return true; },
        },
        {
          key: "Shift-Ctrl-Enter",
          mac: "Shift-Cmd-Enter",
          run: () => { onExecuteAllRef.current?.(); return true; },
        },
        {
          key: "Ctrl-w",
          mac: "Cmd-w",
          run: () => {
            onCloseTabRef.current?.();
            return true;
          },
        },
        {
          key: "Tab",
          run: (view) => {
            const currentAutocomplete = autocompleteRef.current;
            if (currentAutocomplete.open && currentAutocomplete.items.length > 0) {
              applyAutocompleteSuggestion(view, currentAutocomplete.items[currentAutocomplete.selectedIndex]);
              return true;
            }
            view.dispatch(view.state.replaceSelection("  "));
            return true;
          },
        },
        {
          key: "Enter",
          run: (view) => {
            const currentAutocomplete = autocompleteRef.current;
            if (!currentAutocomplete.open || currentAutocomplete.items.length === 0) return false;
            applyAutocompleteSuggestion(view, currentAutocomplete.items[currentAutocomplete.selectedIndex]);
            return true;
          },
        },
        {
          key: "Escape",
          run: () => {
            if (!autocompleteRef.current.open) return false;
            closeAutocomplete();
            return true;
          },
        },
        {
          key: "ArrowDown",
          run: () => {
            if (!autocompleteRef.current.open) return false;
            moveAutocompleteSelection(1);
            return true;
          },
        },
        {
          key: "ArrowUp",
          run: () => {
            if (!autocompleteRef.current.open) return false;
            moveAutocompleteSelection(-1);
            return true;
          },
        },
        {
          key: "Ctrl-g",
          mac: "Cmd-g",
          run: (view) => { showGoToLineDialog(view); return true; },
        },
        {
          key: "Ctrl-.",
          mac: "Cmd-.",
          run: (view) => {
            void triggerPrefixAutocomplete(view);
            return true;
          },
        },
      ]),
      history(),
      keymap.of(historyKeymap),
      keymap.of(searchKeymap),
      keymap.of(defaultKeymap),
      sql({ dialect: PLSQL }),
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      search({ top: true }),
      scopeCompartmentRef.current.of(showScopeLines ? sqlScopeExtension({ color: themeConfig.scopeLineColor, opacity: themeConfig.scopeLineOpacity }) : []),
      themeCompartmentRef.current.of(buildCmTheme(themeConfig)),
      highlightCompartmentRef.current.of(buildHighlightStyle(themeConfig)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const keptObjectAutocompleteOpen = refreshObjectAutocompleteForDocument(update.view);
          const keptColumnAutocompleteOpen = keptObjectAutocompleteOpen ? false : refreshColumnAutocompleteForDocument(update.view);
          if (!keptObjectAutocompleteOpen && !keptColumnAutocompleteOpen) {
            closeAutocomplete();
          }
          onChangeRef.current?.(update.state.doc.toString());
          scheduleParsedStatementsRefresh(update.view);
        }
        if (update.selectionSet && !update.docChanged) {
          closeAutocomplete();
          publishExecutionContext(update.view);
        }
      }),
      EditorView.lineWrapping,
      editableCompartmentRef.current.of(EditorState.readOnly.of(!!(readOnly || disabled))),
      placeholderCompartmentRef.current.of(placeholder ? cmPlaceholder(placeholder) : []),
    ];

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    publishExecutionContext(view, true);

    const handleMouseMove = (event: MouseEvent) => {
      lastMouseEventRef.current = event;
      void updateHoverFeedback(event);
    };
    const handleMouseLeave = () => {
      lastMouseEventRef.current = null;
      clearHoverFeedback();
    };
    const handleKeyChange = (event: KeyboardEvent) => {
      if (isModifierPressed(event)) {
        const lastMouseEvent = lastMouseEventRef.current;
        if (lastMouseEvent) {
          void updateHoverFeedback(lastMouseEvent);
        }
        return;
      }
      clearHoverFeedback();
    };
    const handleClick = async (event: MouseEvent) => {
      if (disabledRef.current || readOnlyRef.current || !isModifierPressed(event)) return;
      const objectRef = getObjectReferenceAtMouseEvent(view, event);
      if (!objectRef) return;
      if (!(await canOpenResolvedObject(objectRef.text))) return;
      event.preventDefault();
      onOpenObjectRef.current?.(objectRef.text);
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeAutocomplete();
      }
    };

    view.dom.addEventListener("mousemove", handleMouseMove);
    view.dom.addEventListener("mouseleave", handleMouseLeave);
    view.dom.addEventListener("click", handleClick, true);
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyChange);
    window.addEventListener("keyup", handleKeyChange);
    window.addEventListener("blur", clearHoverFeedback);
    window.addEventListener("blur", closeAutocomplete);

    return () => {
      if (parseTimeoutRef.current != null) {
        window.clearTimeout(parseTimeoutRef.current);
        parseTimeoutRef.current = null;
      }
      clearHoverFeedback();
      lastMouseEventRef.current = null;
      view.dom.removeEventListener("mousemove", handleMouseMove);
      view.dom.removeEventListener("mouseleave", handleMouseLeave);
      view.dom.removeEventListener("click", handleClick, true);
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyChange);
      window.removeEventListener("keyup", handleKeyChange);
      window.removeEventListener("blur", clearHoverFeedback);
      window.removeEventListener("blur", closeAutocomplete);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Dynamic theme reconfiguration
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeCompartmentRef.current.reconfigure(buildCmTheme(themeConfig)),
        highlightCompartmentRef.current.reconfigure(buildHighlightStyle(themeConfig)),
        scopeCompartmentRef.current.reconfigure(showScopeLines ? sqlScopeExtension({ color: themeConfig.scopeLineColor, opacity: themeConfig.scopeLineOpacity }) : []),
      ],
    });
  }, [showScopeLines, themeConfig]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(EditorState.readOnly.of(!!(readOnly || disabled))),
    });
  }, [disabled, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartmentRef.current.reconfigure(placeholder ? cmPlaceholder(placeholder) : []),
    });
  }, [placeholder]);

  // Sync external value changes (tab switches)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: [Transaction.addToHistory.of(false)],
      });
      publishExecutionContext(view, true);
    }
  }, [value]);

  useEffect(() => {
    if (!autocomplete.open) return;
    const activeItem = autocompleteItemRefs.current[autocomplete.selectedIndex];
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [autocomplete.open, autocomplete.selectedIndex]);

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        position: "relative",
      }}
    >
      {autocomplete.open && (
        <div
          style={{
            position: "absolute",
            top: autocomplete.top,
            left: Math.max(8, autocomplete.left),
            minWidth: 260,
            maxWidth: 420,
            maxHeight: 260,
            overflowY: "auto",
            background: "var(--popup-bg)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.28)",
            zIndex: 20,
          }}
        >
          {autocomplete.loading && (
            <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>
              {autocomplete.kind === "column" ? "Searching columns..." : "Searching objects..."}
            </div>
          )}

          {!autocomplete.loading && autocomplete.items.length === 0 && (
            <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>
              No {autocomplete.kind === "column" ? "columns" : "objects"} found for <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-ui)" }}>{autocomplete.query}</span>
            </div>
          )}

          {!autocomplete.loading && autocomplete.items.map((item, index) => (
            <button
              key={getAutocompleteItemKey(item)}
              ref={(node) => {
                autocompleteItemRefs.current[index] = node;
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                const view = viewRef.current;
                if (!view) return;
                applyAutocompleteSuggestion(view, item);
              }}
              onMouseEnter={() => {
                setAutocomplete((current) => current.open ? { ...current, selectedIndex: index } : current);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 10px",
                border: "none",
                borderBottom: index === autocomplete.items.length - 1 ? "none" : "1px solid var(--border-subtle)",
                background: index === autocomplete.selectedIndex ? "var(--selected-bg)" : "transparent",
                color: "var(--text-primary)",
                textAlign: "left",
              }}
            >
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {getAutocompleteItemLabel(item)}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {getAutocompleteItemDescription(item)}
                </span>
              </span>
              <span style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: getAutocompleteItemBadgeColor(item),
              }}>
                {getAutocompleteItemBadge(item)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}));

function getAutocompleteInsertText(item: SqlAutocompleteItem): string {
  return item.value.name;
}

function filterColumnAutocompleteItems(items: SqlAutocompleteItem[], query: string): SqlAutocompleteItem[] {
  const normalizedQuery = normalizeAutocompleteText(query);
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    if (item.kind !== "column") return false;
    return normalizeAutocompleteText(item.value.name).includes(normalizedQuery);
  });
}

function normalizeAutocompleteText(value: string): string {
  return value.trim().replace(/^"+|"+$/g, "").toUpperCase();
}

function normalizeObjectLookupKey(value: string): string {
  const trimmed = value.trim();
  const objectPart = trimmed.includes(".") ? (trimmed.split(".").pop() ?? trimmed) : trimmed;
  return objectPart.replace(/^"+|"+$/g, "").toUpperCase();
}

function getAutocompleteItemKey(item: SqlAutocompleteItem): string {
  return item.kind === "object"
    ? `object:${item.value.objectKind}:${item.value.schema}:${item.value.name}`
    : `column:${item.value.schema}:${item.value.table}:${item.value.name}:${item.value.alias ?? ""}`;
}

function getAutocompleteItemLabel(item: SqlAutocompleteItem): string {
  return item.value.name;
}

function getAutocompleteItemDescription(item: SqlAutocompleteItem): string {
  if (item.kind === "object") {
    return item.value.schema;
  }

  const alias = item.value.alias ? `${item.value.alias} → ` : "";
  return `${alias}${item.value.table} · ${item.value.dataType}`;
}

function getAutocompleteItemBadge(item: SqlAutocompleteItem): string {
  return item.kind === "object" ? item.value.objectKind : "COLUMN";
}

function getAutocompleteItemBadgeColor(item: SqlAutocompleteItem): string {
  if (item.kind === "column") return "var(--warning)";
  return item.value.objectKind === "TABLE" ? "var(--focus-color)" : "var(--text-secondary)";
}
