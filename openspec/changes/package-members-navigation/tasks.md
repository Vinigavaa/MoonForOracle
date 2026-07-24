## 1. Member parser (shared util)

- [x] 1.1 `parsePackageMembers(bodySource): PackageMember[]` (`{ name, kind, line }`, 1-based line) — `packages/utils/src/package-members.ts`, exported via `@gavadb/utils`
- [x] 1.2 Conservative line scanner for top-level `FUNCTION`/`PROCEDURE <identifier>`, skipping `--`/`/* */` comments and string literals (`blankCommentsAndStrings`)
- [x] 1.3 Unit tests (line comment / block comment / string ignored, whitespace, case, empty) — `packages/utils/src/package-members.test.ts`, wired into the utils `test` script

## 2. Member list state (auto load + cache)

- [x] 2.1 `usePackageMembers(isConnected)` hook keyed by package name — `apps/renderer/src/hooks/usePackageMembers.ts`
- [x] 2.2 Load via `dbGetSource("packages", name)` → parse `body` tab → cache for the session
- [x] 2.3 Reset cache on disconnect (hook effect on `!isConnected`)

## 3. Active-object reporting (editor → sidebar)

- [x] 3.1 `QueryWorkspace` derives the active tab's object identity and fires `onActiveObjectChange({ type, name } | null)` on change
- [x] 3.2 Thread the callback through `SqlEditor` to `App`; `App` holds `activeObject` state and passes it to `Sidebar`

## 4. Sidebar Navigator UI

- [x] 4.1 `PackageNavigatorSection` in `Sidebar.tsx` — collapsible section reflecting the active package; auto-loads members on activation via an effect
- [x] 4.2 Render members with a function/procedure icon (`Blocks` for procedure, `ƒ` for function); click calls `onObjectSelect("packages", name, { line, part: "body" })`
- [x] 4.3 Render loading, empty ("No members"), error+retry, and "open a package" (no active package) states
- [x] 4.4 Remove the earlier manual per-package expansion from the Database Objects tree (reverted `PackageRow`/tree-member plumbing)

## 5. Navigation target plumbing (click → editor scroll)

- [x] 5.1 `onObjectSelect(type, name, target?)` in `Sidebar` and `App.handleObjectSelect`
- [x] 5.2 `openObject`/`openObjectTab` accept and store `ObjectNavigationTarget` (monotonic `token`) on the object tab (`queryWorkspaceTypes.ts`); reuse existing tab
- [x] 5.3 `ObjectViewer` → `ObjectEditorContainer` receive `navTarget`; effect after source load switches to `body` and calls `focusLine(line)` via rAF; token re-triggers on same-member re-click

## 6. Verification

- [x] 6.1 `pnpm run typecheck` — 10/10 packages clean; production `vite build` succeeds
- [x] 6.2 `parsePackageMembers` unit tests — 6/6 PASS
- [ ] 6.3 Manual `npm run dev` against a real Oracle: open a package → Navigator lists its subprograms; click a function/procedure → editor jumps to the body declaration line; switch tabs → Navigator follows the active package; re-activate → instant (cached); package with no members shows the empty state — **pending user run against a connected DB**
