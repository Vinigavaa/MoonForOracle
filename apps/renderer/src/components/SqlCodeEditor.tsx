import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import { countRender } from "../lib/perfLog";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { sql, PLSQL } from "@codemirror/lang-sql";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { search, openSearchPanel, closeSearchPanel } from "@codemirror/search";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { SqlEditorExecutionSnapshot } from "../lib/sqlExecutionTarget";
import { buildExecutionSnapshot } from "../lib/sqlExecutionTarget";
import type { EditorThemeConfig } from "../lib/editorTheme";
import { useEditorTheme } from "../hooks/EditorThemeContext";

interface SqlCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onExecute?: () => void;
  onExecuteAll?: () => void;
  onOpenObject?: (name: string) => void | Promise<void>;
  onExecutionContextChange?: (snapshot: SqlEditorExecutionSnapshot) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}

export interface SqlCodeEditorHandle {
  getExecutionSnapshot: () => SqlEditorExecutionSnapshot;
  focus: () => void;
}

// ─── Build CodeMirror theme from config ─────────────────────────────

function buildCmTheme(cfg: EditorThemeConfig) {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${cfg.fontSize}px`,
      fontFamily: cfg.fontFamily,
      background: cfg.bgEditor,
      color: cfg.textDefault,
    },
    ".cm-content": {
      padding: "8px 12px",
      caretColor: cfg.cursor,
      lineHeight: "1.6",
      tabSize: "2",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: cfg.fontFamily,
    },
    ".cm-line": { padding: 0 },
    ".cm-cursor": { borderLeftColor: cfg.cursor },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      background: `${cfg.selection} !important`,
    },
    ".cm-gutters": {
      background: cfg.bgGutter,
      color: cfg.textPlaceholder,
      border: "none",
      borderRight: "1px solid var(--divider-color)",
      fontSize: `${Math.max(cfg.fontSize - 2, 10)}px`,
      minWidth: "3.5em",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 4px",
      minWidth: "3em",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      background: cfg.activeLine,
      color: cfg.cursor,
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
    { tag: tags.operatorKeyword, color: cfg.textOperator, fontWeight: "bold" },
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
  onOpenObject,
  onExecutionContextChange,
  disabled,
  readOnly,
  placeholder,
}, ref) {
  countRender("SqlCodeEditor");
  const { theme: themeConfig } = useEditorTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);
  const onExecuteAllRef = useRef(onExecuteAll);
  const onOpenObjectRef = useRef(onOpenObject);
  const onExecutionContextChangeRef = useRef(onExecutionContextChange);
  const disabledRef = useRef(disabled);
  const readOnlyRef = useRef(readOnly || disabled);
  const editableCompartmentRef = useRef(new Compartment());
  const placeholderCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());
  const highlightCompartmentRef = useRef(new Compartment());
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const hoveredWordRef = useRef<string | null>(null);
  const lastMouseEventRef = useRef<MouseEvent | null>(null);
  const parsedStatementsRef = useRef(buildExecutionSnapshot(value, 0, 0, 0).statements);
  const parsedDocRef = useRef(value);
  const parseTimeoutRef = useRef<number | null>(null);

  onChangeRef.current = onChange;
  onExecuteRef.current = onExecute;
  onExecuteAllRef.current = onExecuteAll;
  onOpenObjectRef.current = onOpenObject;
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

  function isModifierPressed(event: MouseEvent | KeyboardEvent) {
    return navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey;
  }

  function getWordAtMouseEvent(view: EditorView, event: MouseEvent) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return null;

    const word = view.state.wordAt(pos);
    if (!word) return null;

    const text = view.state.sliceDoc(word.from, word.to).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(text)) return null;

    return text;
  }

  function updateHoverFeedback(event: MouseEvent) {
    const view = viewRef.current;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!view || !target || disabledRef.current || readOnlyRef.current || !isModifierPressed(event)) {
      clearHoverFeedback();
      return;
    }

    const word = getWordAtMouseEvent(view, event);
    if (!word) {
      clearHoverFeedback();
      return;
    }

    if (hoveredElementRef.current !== target) {
      clearHoverFeedback();
      hoveredElementRef.current = target;
    }

    hoveredWordRef.current = word;
    target.style.textDecoration = "underline";
    target.style.cursor = "pointer";
  }

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      keymap.of([
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
          key: "Tab",
          run: (view) => {
            view.dispatch(view.state.replaceSelection("  "));
            return true;
          },
        },
        {
          key: "Ctrl-g",
          mac: "Cmd-g",
          run: (view) => { showGoToLineDialog(view); return true; },
        },
      ]),
      history(),
      keymap.of(historyKeymap),
      keymap.of(defaultKeymap),
      sql({ dialect: PLSQL }),
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      search({ top: true }),
      themeCompartmentRef.current.of(buildCmTheme(themeConfig)),
      highlightCompartmentRef.current.of(buildHighlightStyle(themeConfig)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
          scheduleParsedStatementsRefresh(update.view);
        }
        if (update.selectionSet && !update.docChanged) {
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
      updateHoverFeedback(event);
    };
    const handleMouseLeave = () => {
      lastMouseEventRef.current = null;
      clearHoverFeedback();
    };
    const handleKeyChange = (event: KeyboardEvent) => {
      if (isModifierPressed(event)) {
        const lastMouseEvent = lastMouseEventRef.current;
        if (lastMouseEvent) {
          updateHoverFeedback(lastMouseEvent);
        }
        return;
      }
      clearHoverFeedback();
    };
    const handleClick = (event: MouseEvent) => {
      if (disabledRef.current || readOnlyRef.current || !isModifierPressed(event)) return;
      const word = getWordAtMouseEvent(view, event);
      if (!word) return;
      event.preventDefault();
      onOpenObjectRef.current?.(word);
    };

    view.dom.addEventListener("mousemove", handleMouseMove);
    view.dom.addEventListener("mouseleave", handleMouseLeave);
    view.dom.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKeyChange);
    window.addEventListener("keyup", handleKeyChange);
    window.addEventListener("blur", clearHoverFeedback);

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
      window.removeEventListener("keydown", handleKeyChange);
      window.removeEventListener("keyup", handleKeyChange);
      window.removeEventListener("blur", clearHoverFeedback);
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
      ],
    });
  }, [themeConfig]);

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

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        position: "relative",
      }}
    />
  );
}));
