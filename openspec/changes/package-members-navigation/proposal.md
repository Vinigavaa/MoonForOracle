## Why

Today a package appears in the sidebar as a single leaf: clicking it opens the whole package source, and the user has to scroll or use go-to-line to find a given subprogram. In real PL/SQL packages (hundreds of functions/procedures across thousands of lines) this makes locating and jumping to a specific member slow. Exposing the members directly in the sidebar tree, with one-click navigation straight to the declaration, turns the package node into a usable outline.

## What Changes

- A dedicated **Navigator** section in the sidebar lists the top-level functions and procedures of the package currently open/active in the editor — like the "Local Subprograms" navigator in Toad/PL-SQL Developer. It reflects the active tab automatically; the user does not expand anything manually.
- Member list is derived from the package **body** source (top-level `FUNCTION`/`PROCEDURE` declarations and their line numbers), so the line shown matches exactly what the editor will scroll to.
- Clicking a member switches the package editor to the **body** part and scrolls/places the caret at that member's declaration line. Re-clicking the same member re-navigates.
- The member list is loaded automatically when a package becomes active and cached per package for the session.

## Capabilities

### New Capabilities
- `package-navigation`: a sidebar Navigator shows the subprograms (functions and procedures) of the package open in the editor, and selecting one navigates directly to its declaration in the package body source.

### Modified Capabilities
<!-- No existing specs under openspec/specs/ — nothing to modify. -->

## Impact

- **Renderer only** — no schema, IPC-contract, or main-process changes (member list is parsed client-side from the existing `db:get-source` response for packages).
- Affected code:
  - `apps/renderer/src/components/Sidebar.tsx` — new `PackageNavigatorSection` reflecting the active package.
  - `apps/renderer/src/hooks/usePackageMembers.ts` — lazy load + session cache of package members.
  - `packages/utils/src/package-members.ts` (+ tests) — `parsePackageMembers` extracting `{ name, kind, line }[]` from body source, exported via `@gavadb/utils`.
  - Active-object reporting from the editor up to the sidebar: `apps/renderer/src/components/query-workspace/QueryWorkspace.tsx`, `apps/renderer/src/components/SqlEditor.tsx`, `apps/renderer/src/App.tsx`.
  - Navigation plumbing to carry an optional target line/part from click → `openObject` → object tab → `ObjectViewer` → `ObjectEditorContainer` → `SqlCodeEditor.focusLine`: `queryWorkspaceTypes.ts`, `QueryWorkspace.tsx`, `ObjectViewer.tsx`, `ObjectEditorContainer.tsx`.
- Reuses the existing `SqlCodeEditorHandle.focusLine(line, column)` primitive — no new editor capability needed.
- No new dependencies.
