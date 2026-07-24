## Context

The sidebar's Database Objects section (`apps/renderer/src/components/Sidebar.tsx`) lists object types; each `SidebarSection` renders a flat list of names and clicking one calls `onObjectSelect(type, name)`. For a package that resolves to `App.handleObjectSelect` → `sqlEditorRef.current.openObject("packages", name)` → `QueryWorkspace.openObjectTab(null, "object", ...)`, which creates an `"object"` tab rendering `ObjectViewer`. `ObjectViewer` uses `useObjectDetail` (`window.gavadb.dbGetSource`) to fetch a `SourceDetail` whose `tabs` are the package **spec** and **body** parts, then renders `ObjectEditorContainer` → `SqlCodeEditor`.

Two existing primitives make this feature cheap:

- `SqlCodeEditorHandle.focusLine(line, column?)` already scrolls to and selects a line (used today by the compile-error panel via `editorRef.current?.focusLine(...)`).
- The package **body** source is already fetched in full by `dbGetSource("packages", name)`. Parsing top-level `FUNCTION`/`PROCEDURE` declarations from that exact text yields member names whose line numbers line up 1:1 with what `focusLine` will scroll to.

The gap is (a) the sidebar has no per-package expansion/child list, and (b) there is no way to pass a target line from a click through `openObject` into the editor.

## Goals / Non-Goals

**Goals:**
- A sidebar Navigator that automatically lists the functions/procedures of the package open in the editor (function-vs-procedure iconography), like Toad/PL-SQL Developer's "Local Subprograms".
- One-click navigation from a member to its declaration line in the body editor.
- Automatic per-package load with session caching; robust to parse/fetch failure.
- Renderer-only change; no IPC-contract or main-process changes.

**Non-Goals:**
- Members of objects other than packages (standalone procedures/functions, triggers).
- Parsing member signatures/parameters, overload disambiguation, or a full PL/SQL parser.
- Navigating into the package **spec** part (navigation targets the body declaration).
- Live re-sync of the member list while the user edits the body in the editor.
- Search/filter across members (existing object filter stays name-level).

## Decisions

### D1: Derive members by parsing the body source, not by querying `ALL_PROCEDURES`
`ALL_PROCEDURES`/`ALL_ARGUMENTS` give member names but **no line number**, and complicate overloads. Parsing the body text we already fetch gives `{ name, kind, line }` with a line that is guaranteed consistent with the editor content. A small, forgiving regex/line scanner (top-level `FUNCTION|PROCEDURE <identifier>`, skipping the spec part) is sufficient — full PL/SQL parsing is a non-goal.
- *Alternative considered:* new IPC `db:list-package-members` running server-side SQL. Rejected for now — adds contract surface and still lacks reliable line numbers; the parse util can be promoted to main later if needed.

### D2: Reuse `dbGetSource("packages", name)` for the member list
Expanding a package calls the same IPC the editor uses. Shared parser util `apps/renderer/src/lib/parsePackageMembers.ts` consumes the `body` tab's `source`. No new data path.
- *Trade-off:* fetches the full source on expand even though only the outline is shown. Acceptable — it warms the same data the editor needs and is cached.

### D3: Thread an optional navigation target through the open-object call chain
Extend the object-open path with an optional `target?: { line: number; part?: "spec" | "body" }`:
`Sidebar` → `onObjectSelect(type, name, target?)` → `App.handleObjectSelect` → `SqlEditorHandle.openObject(type, name, target?)` → `QueryWorkspace.openObjectTab(...)` storing a pending target on the object tab state → `ObjectViewer` prop → `ObjectEditorContainer` prop. Because source load is async, `ObjectEditorContainer` applies the target in an effect that runs after `detail`/tabs are set: switch `activeTabId` to `body`, then `editorRef.current?.focusLine(target.line)`. A monotonically-increasing target token (not just the line value) ensures re-clicking the *same* member re-triggers the scroll.
- *Alternative considered:* an imperative editor-registry/ref keyed by tab id. Rejected as heavier; prop + effect matches the existing `useEffect([detail])` reset already in `ObjectEditorContainer`.

### D4: Member list state lives in a focused `usePackageMembers` hook
Lazy load + cache keyed by package name in `apps/renderer/src/hooks/usePackageMembers.ts`. Cache is session-scoped and cleared on disconnect.

### D5: Navigator is driven by the active editor object, not manual tree expansion (revised direction)
The Navigator lives in its own sidebar section and reflects whichever package is active in the editor — it appears/updates automatically on open or tab-switch, matching the reference tool's behavior. This replaces the earlier idea of expanding each package node inside the Database Objects tree (which required the user to find and expand the node manually). To drive it, `QueryWorkspace` derives the active tab's object identity and reports it up through `SqlEditor` to `App`, which passes it to the `Sidebar`. Clicking a member reuses the D3 navigation-target plumbing (the active package tab is, by definition, already open), so no duplicate-tab logic is needed for the Navigator path.
- *Alternative considered:* auto-expanding the matching node in the Database Objects tree. Rejected — the reference UX is a dedicated navigator beside the code, and coupling it to the DB tree's expand state is more fragile.

## Risks / Trade-offs

- **Parser misses/false-positives on unusual formatting** (e.g. `FUNCTION` inside a comment/string, line-broken signatures) → Keep the scanner conservative and line-based; a missed member only means it isn't listed (the package still opens normally). Cover known shapes (leading whitespace, `FUNCTION`/`PROCEDURE` keyword case-insensitive) with unit tests on the parser util.
- **Line drift if the user has edited the body in the editor before clicking** → Out of scope (non-goal D-list); navigation uses the originally-parsed line. Acceptable because the outline reflects the last-loaded source; a stale jump is a minor annoyance, not data loss.
- **Async focus race (click before source loads)** → Handled by D3's effect-after-load + target token; the spec requires the scroll to survive the pending-load case.
- **Fetching full source on every first-expand** for very large packages → Same cost the editor already pays; cached thereafter.

## Migration Plan

Additive UI feature, no persisted data or schema change. Ships in one renderer build; rollback is reverting the renderer changes. No migration steps.

## Open Questions

- Should double-click vs single-click differ (expand vs navigate), or is a dedicated chevron for expand + row-click for navigate clearer? Leaning: chevron toggles expand, clicking the member row navigates — consistent with existing section chevrons.
- Icon choice for procedure vs function within lucide-react (proposal suggests reusing `Blocks` for procedures and the `ƒ` fallback glyph for functions, matching the section icons).
