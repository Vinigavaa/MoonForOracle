import { Facet, RangeSet, RangeSetBuilder } from "@codemirror/state";
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from "@codemirror/view";
import { findNearestSqlScope, findSqlScopeAtCursor, getSqlScopePath, parseSqlScopeBlocks, type SqlScopeBlock } from "@gavadb/utils";

const GUIDE_SLOT_WIDTH = 7;
const GUIDE_PADDING = 6;

interface SqlScopeTheme {
  color: string;
  opacity: number;
}

const sqlScopeThemeFacet = Facet.define<SqlScopeTheme, SqlScopeTheme>({
  combine(values) {
    return values[values.length - 1] ?? { color: "#6c7086", opacity: 0.34 };
  },
});

interface GuideRenderData {
  depth: number;
  active: boolean;
  startsHere: boolean;
  endsHere: boolean;
}

class ScopeGutterMarker extends GutterMarker {
  constructor(
    private readonly guides: GuideRenderData[],
    private readonly theme: SqlScopeTheme,
    private readonly maxDepth: number,
  ) {
    super();
  }

  eq(other: ScopeGutterMarker): boolean {
    return JSON.stringify(this.guides) === JSON.stringify(other.guides)
      && this.theme.color === other.theme.color
      && this.theme.opacity === other.theme.opacity
      && this.maxDepth === other.maxDepth;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-sql-scope-gutter-marker";
    wrap.style.setProperty("--scope-line-color", this.theme.color);
    wrap.style.setProperty("--scope-line-opacity", String(this.theme.opacity));
    wrap.style.width = `${GUIDE_PADDING * 2 + Math.max(this.maxDepth, 1) * GUIDE_SLOT_WIDTH}px`;

    for (const guide of this.guides) {
      const vertical = document.createElement("span");
      vertical.className = `cm-sql-scope-gutter-line${guide.active ? " is-active" : ""}`;
      vertical.style.left = `${GUIDE_PADDING + guide.depth * GUIDE_SLOT_WIDTH}px`;
      vertical.style.top = guide.startsHere ? "50%" : "0";
      vertical.style.height = guide.endsHere ? "50%" : "100%";
      wrap.appendChild(vertical);

      if (guide.startsHere) {
        const elbow = document.createElement("span");
        elbow.className = `cm-sql-scope-gutter-elbow${guide.active ? " is-active" : ""}`;
        elbow.style.left = `${GUIDE_PADDING + guide.depth * GUIDE_SLOT_WIDTH}px`;
        elbow.style.top = "50%";
        elbow.style.width = `${Math.max(4, GUIDE_SLOT_WIDTH - 1)}px`;
        wrap.appendChild(elbow);
      }
    }

    return wrap;
  }
}

function buildScopeMarkers(view: EditorView, blocks: SqlScopeBlock[]) {
  const theme = view.state.facet(sqlScopeThemeFacet);
  const cursor = view.state.selection.main.head;
  const active = findSqlScopeAtCursor(blocks, cursor) ?? findNearestSqlScope(blocks, cursor);
  const path = getSqlScopePath(blocks, active?.id ?? null);

  if (path.length === 0) {
    return RangeSet.empty;
  }

  const builder = new RangeSetBuilder<GutterMarker>();
  const seenLines = new Set<number>();
  const maxDepth = Math.max(...path.map((block) => block.depth + 1));

  for (const range of view.visibleRanges) {
    let line = view.state.doc.lineAt(range.from);
    const endLineNumber = view.state.doc.lineAt(range.to).number;

    while (line.number <= endLineNumber) {
      if (seenLines.has(line.from)) {
        line = line.number < view.state.doc.lines ? view.state.doc.line(line.number + 1) : line;
        if (line.number === endLineNumber && seenLines.has(line.from)) break;
        continue;
      }

      const guides = path.flatMap((block) => {
        const blockStartLine = view.state.doc.lineAt(block.start);
        const blockEndLine = view.state.doc.lineAt(Math.max(block.start, block.end - 1));
        if (line.number < blockStartLine.number || line.number > blockEndLine.number) {
          return [];
        }

        return [{
          depth: block.depth,
          active: block.id === active?.id,
          startsHere: line.number === blockStartLine.number,
          endsHere: line.number === blockEndLine.number,
        }] satisfies GuideRenderData[];
      });

      if (guides.length > 0) {
        builder.add(line.from, line.from, new ScopeGutterMarker(guides, theme, maxDepth));
        seenLines.add(line.from);
      }

      if (line.number >= endLineNumber) break;
      line = view.state.doc.line(line.number + 1);
    }
  }

  return builder.finish();
}

const sqlScopeViewPlugin = ViewPlugin.fromClass(class {
  markers: RangeSet<GutterMarker>;
  private parsedBlocks: SqlScopeBlock[];

  constructor(private readonly view: EditorView) {
    this.parsedBlocks = parseSqlScopeBlocks(view.state.doc.toString());
    this.markers = buildScopeMarkers(view, this.parsedBlocks);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      const nextDoc = update.state.doc.toString();
      this.parsedBlocks = nextDoc.length === 0 ? [] : parseSqlScopeBlocks(nextDoc);
    }

    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.markers = buildScopeMarkers(update.view, this.parsedBlocks);
    }
  }
});

function sqlScopeGutter() {
  return gutter({
    class: "cm-sql-scope-gutter",
    renderEmptyElements: false,
    markers(view) {
      const plugin = view.plugin(sqlScopeViewPlugin);
      return plugin?.markers ?? RangeSet.empty;
    },
    initialSpacer(view) {
      const theme = view.state.facet(sqlScopeThemeFacet);
      return new ScopeGutterMarker([], theme, 3);
    },
  });
}

export function sqlScopeExtension(theme: SqlScopeTheme) {
  return [sqlScopeThemeFacet.of(theme), sqlScopeViewPlugin, sqlScopeGutter()];
}
