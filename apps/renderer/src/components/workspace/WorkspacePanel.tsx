import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, File, FileAxis3d, Folder, FolderPlus } from "lucide-react";
import type { WorkspaceFolderNode, WorkspaceNode, WorkspaceReadFileResponse, WorkspaceTree } from "@gavadb/types";
import { useToastContext } from "../../hooks/ToastContext";

interface WorkspacePanelProps {
  onOpenFile: (file: WorkspaceReadFileResponse) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: WorkspaceNode | null;
}

interface EditingState {
  path: string;
  originalName: string;
  isNew: boolean;
  session: number;
}

const INDENT_SIZE = 14;

export function WorkspacePanel({ onOpenFile }: WorkspacePanelProps) {
  const toast = useToastContext();
  const [tree, setTree] = useState<WorkspaceTree>({ root: null });
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const editSessionRef = useRef(0);
  const rootPath = tree.root?.path ?? null;

  const nextEditSession = useCallback(() => {
    editSessionRef.current += 1;
    return editSessionRef.current;
  }, []);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.gavadb.workspaceGetTree();
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setTree(result.data);
      if (result.data.root) {
        setExpandedPaths((prev) => new Set(prev).add(result.data.root!.path));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const close = () => setContextMenu(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const selectedNode = useMemo(
    () => (selectedPath && tree.root ? findNode(tree.root, selectedPath) : null),
    [selectedPath, tree.root],
  );

  const setOperationTree = useCallback((nextTree: WorkspaceTree) => {
    setTree(nextTree);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (nextTree.root) next.add(nextTree.root.path);
      return next;
    });
  }, []);

  const openFolder = useCallback(async () => {
    setContextMenu(null);
    setBusy(true);
    try {
      const result = await window.gavadb.workspaceOpenFolder();
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      if (!result.data) return;

      setTree(result.data);
      setSelectedPath(result.data.root?.path ?? null);
      setExpandedPaths(result.data.root ? new Set([result.data.root.path]) : new Set());
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const createItem = useCallback(async (type: "file" | "folder", parentPath?: string | null) => {
    const targetParent = parentPath ?? selectedTargetFolderPath(selectedNode) ?? rootPath;
    if (!targetParent) {
      await openFolder();
      return;
    }

    setContextMenu(null);
    setBusy(true);
    try {
      const result = type === "folder"
        ? await window.gavadb.workspaceCreateFolder({ parentPath: targetParent })
        : await window.gavadb.workspaceCreateFile({ parentPath: targetParent });

      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setOperationTree(result.data.tree);
      setExpandedPaths((prev) => new Set(prev).add(targetParent));
      if (result.data.itemPath) {
        const createdNode = result.data.tree.root ? findNode(result.data.tree.root, result.data.itemPath) : null;
        setSelectedPath(result.data.itemPath);
        setEditing({
          path: result.data.itemPath,
          originalName: createdNode?.name ?? "",
          isNew: true,
          session: nextEditSession(),
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [nextEditSession, openFolder, rootPath, selectedNode, setOperationTree, toast]);

  const renameItem = useCallback((node: WorkspaceNode) => {
    setContextMenu(null);
    setSelectedPath(node.path);
    setEditing({ path: node.path, originalName: node.name, isNew: false, session: nextEditSession() });
  }, [nextEditSession]);

  const deleteItem = useCallback(async (node: WorkspaceNode, askConfirmation = true) => {
    setContextMenu(null);
    if (!node.parentPath) return;
    if (askConfirmation && !window.confirm(`Delete "${node.name}" from disk?`)) return;

    setBusy(true);
    try {
      const result = await window.gavadb.workspaceDeleteItem({ path: node.path });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setOperationTree(result.data.tree);
      setSelectedPath((current) => (current === node.path ? node.parentPath : current));
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [setOperationTree, toast]);

  const commitRename = useCallback(async (node: WorkspaceNode, nextName: string, isNew: boolean) => {
    const name = nextName.trim();
    if (!name) {
      if (isNew) {
        await deleteItem(node, false);
      }
      setEditing(null);
      return;
    }

    if (name === node.name) {
      setEditing(null);
      return;
    }

    setBusy(true);
    try {
      const result = await window.gavadb.workspaceRenameItem({ path: node.path, newName: name });
      if (!result.success) {
        toast.error(result.error.message);
        setEditing({ path: node.path, originalName: node.name, isNew, session: nextEditSession() });
        return;
      }

      setOperationTree(result.data.tree);
      setSelectedPath(result.data.itemPath ?? null);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [deleteItem, nextEditSession, setOperationTree, toast]);

  const cancelRename = useCallback(async (node: WorkspaceNode, isNew: boolean) => {
    if (isNew) {
      await deleteItem(node, false);
      return;
    }
    setEditing(null);
  }, [deleteItem]);

  const openFile = useCallback(async (node: WorkspaceNode) => {
    if (node.type !== "file") return;
    setSelectedPath(node.path);

    try {
      const result = await window.gavadb.workspaceReadFile({ path: node.path });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      onOpenFile(result.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [onOpenFile, toast]);

  const toggleFolder = useCallback((node: WorkspaceNode) => {
    if (node.type !== "folder") return;
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  }, []);

  const moveItem = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    if (!sourcePath || sourcePath === targetFolderPath) return;
    if (isSameOrDescendant(sourcePath, targetFolderPath)) {
      toast.warning("A folder cannot be moved into itself or one of its descendants.");
      return;
    }

    setBusy(true);
    try {
      const result = await window.gavadb.workspaceMoveItem({ sourcePath, targetFolderPath });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      setOperationTree(result.data.tree);
      setSelectedPath(result.data.itemPath ?? sourcePath);
      setExpandedPaths((prev) => new Set(prev).add(targetFolderPath));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setDraggingPath(null);
      setDropTargetPath(null);
    }
  }, [setOperationTree, toast]);

  const handleContainerContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, node: null });
  }, []);

  const handleContainerDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!rootPath) return;
    event.preventDefault();
    const sourcePath = event.dataTransfer.getData("application/x-gavadb-workspace-path");
    void moveItem(sourcePath, rootPath);
  }, [moveItem, rootPath]);

  const renderContent = () => {
    if (loading) {
      return <div style={workspaceInfoStyle}>Loading workspace...</div>;
    }

    if (!tree.root) {
      return (
        <div style={emptyWorkspaceStyle}>
          <button type="button" onClick={() => void openFolder()} style={emptyActionButtonStyle}>
            Open Folder
          </button>
        </div>
      );
    }

    return (
      <WorkspaceTreeView
        root={tree.root}
        expandedPaths={expandedPaths}
        selectedPath={selectedPath}
        editing={editing}
        draggingPath={draggingPath}
        dropTargetPath={dropTargetPath}
        onSelect={setSelectedPath}
        onToggle={toggleFolder}
        onOpenFile={(node) => void openFile(node)}
        onRename={renameItem}
        onDelete={(node) => void deleteItem(node)}
        onCreateFile={(parentPath) => void createItem("file", parentPath)}
        onCreateFolder={(parentPath) => void createItem("folder", parentPath)}
        onCommitRename={(node, value, isNew) => void commitRename(node, value, isNew)}
        onCancelRename={(node, isNew) => void cancelRename(node, isNew)}
        onContextMenu={(event, node) => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedPath(node.path);
          setContextMenu({ x: event.clientX, y: event.clientY, node });
        }}
        onDragStart={(node, event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-gavadb-workspace-path", node.path);
          setDraggingPath(node.path);
        }}
        onDragEnd={() => {
          setDraggingPath(null);
          setDropTargetPath(null);
        }}
        onMove={moveItem}
        onDropTargetChange={setDropTargetPath}
      />
    );
  };

  return (
    <div style={panelStyle}>
      <div style={sectionHeaderRowStyle}>
        <button
          type="button"
          onClick={() => setSectionExpanded((current) => !current)}
          aria-expanded={sectionExpanded}
          style={sectionHeaderButtonStyle}
        >
          <ChevronDown
            size={13}
            strokeWidth={2.2}
            aria-hidden="true"
            style={{
              ...sectionHeaderChevronStyle,
              transform: sectionExpanded ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <span>Files</span>
        </button>
        <div style={toolbarButtonGroupStyle}>
          <button
            type="button"
            onClick={() => {
              setSectionExpanded(true);
              void createItem("file");
            }}
            title="New file"
            aria-label="New file"
            style={toolbarIconButtonStyle}
          >
            <FileAxis3d size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSectionExpanded(true);
              void createItem("folder");
            }}
            title="New folder"
            aria-label="New folder"
            style={toolbarIconButtonStyle}
          >
            <FolderPlus size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSectionExpanded(true);
              void openFolder();
            }}
            title="Open folder"
            aria-label="Open folder"
            style={toolbarIconButtonStyle}
          >
            {"\u2315"}
          </button>
        </div>
      </div>

      {sectionExpanded && (
        <div
          style={{
            ...treeContainerStyle,
            opacity: busy ? 0.82 : 1,
            outline: dropTargetPath === rootPath ? "1px solid var(--accent)" : "none",
          }}
          onContextMenu={handleContainerContextMenu}
          onDragOver={(event) => {
            if (!rootPath || !draggingPath) return;
            event.preventDefault();
            setDropTargetPath(rootPath);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDropTargetPath(null);
          }}
          onDrop={handleContainerDrop}
        >
          {renderContent()}
        </div>
      )}

      {contextMenu && (
        <WorkspaceContextMenu
          state={contextMenu}
          rootPath={rootPath}
          onClose={() => setContextMenu(null)}
          onNewFile={(parentPath) => void createItem("file", parentPath)}
          onNewFolder={(parentPath) => void createItem("folder", parentPath)}
          onOpenFolder={() => void openFolder()}
          onOpenFile={(node) => void openFile(node)}
          onRename={renameItem}
          onDelete={(node) => void deleteItem(node)}
        />
      )}
    </div>
  );
}

interface WorkspaceTreeViewProps {
  root: WorkspaceFolderNode;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  editing: EditingState | null;
  draggingPath: string | null;
  dropTargetPath: string | null;
  onSelect: (path: string) => void;
  onToggle: (node: WorkspaceNode) => void;
  onOpenFile: (node: WorkspaceNode) => void;
  onRename: (node: WorkspaceNode) => void;
  onDelete: (node: WorkspaceNode) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onCommitRename: (node: WorkspaceNode, value: string, isNew: boolean) => void;
  onCancelRename: (node: WorkspaceNode, isNew: boolean) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>, node: WorkspaceNode) => void;
  onDragStart: (node: WorkspaceNode, event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMove: (sourcePath: string, targetFolderPath: string) => void;
  onDropTargetChange: (path: string | null) => void;
}

function WorkspaceTreeView(props: WorkspaceTreeViewProps) {
  return (
    <div role="tree" aria-label="Workspace files">
      <WorkspaceTreeNode node={props.root} depth={0} {...props} />
    </div>
  );
}

function WorkspaceTreeNode({
  node,
  depth,
  expandedPaths,
  selectedPath,
  editing,
  draggingPath,
  dropTargetPath,
  onSelect,
  onToggle,
  onOpenFile,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
  onCommitRename,
  onCancelRename,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onMove,
  onDropTargetChange,
}: WorkspaceTreeViewProps & { node: WorkspaceNode; depth: number }) {
  const isFolder = node.type === "folder";
  const isExpanded = isFolder && expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isEditing = editing?.path === node.path;
  const editingForNode = isEditing ? editing : null;
  const isDropTarget = dropTargetPath === node.path;
  const isDragging = draggingPath === node.path;
  const canDrop = isFolder && draggingPath && draggingPath !== node.path && !isSameOrDescendant(draggingPath, node.path);

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        draggable={!isEditing && !!node.parentPath}
        onDragStart={(event) => onDragStart(node, event)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!canDrop) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          onDropTargetChange(node.path);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) onDropTargetChange(null);
        }}
        onDrop={(event) => {
          if (!canDrop) return;
          event.preventDefault();
          event.stopPropagation();
          const sourcePath = event.dataTransfer.getData("application/x-gavadb-workspace-path");
          onMove(sourcePath, node.path);
        }}
        onContextMenu={(event) => onContextMenu(event, node)}
        onClick={() => {
          onSelect(node.path);
          if (node.type === "file") onOpenFile(node);
        }}
        onDoubleClick={() => {
          if (node.type === "folder") onToggle(node);
        }}
        style={{
          ...treeRowStyle,
          paddingLeft: 6 + depth * INDENT_SIZE,
          background: isDropTarget ? "rgba(137, 180, 250, 0.18)" : isSelected ? "var(--selected-bg)" : "transparent",
          opacity: isDragging ? 0.45 : 1,
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            if (isFolder) onToggle(node);
          }}
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
          style={{
            ...chevronButtonStyle,
            visibility: isFolder ? "visible" : "hidden",
            transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        >
          <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <span style={iconStyle}>
          {isFolder
            ? <Folder size={14} strokeWidth={1.9} aria-hidden="true" />
            : <File size={14} strokeWidth={1.9} aria-hidden="true" />}
        </span>
        {editingForNode ? (
          <InlineRenameInput
            key={editingForNode.session}
            initialValue={node.name}
            isNew={editingForNode.isNew}
            onCommit={(value) => onCommitRename(node, value, editingForNode.isNew)}
            onCancel={() => onCancelRename(node, editingForNode.isNew)}
          />
        ) : (
          <span style={nodeNameStyle} title={node.path}>
            {node.name}
          </span>
        )}
      </div>

      {node.type === "folder" && isExpanded && (
        <div role="group">
          {node.children.map((child) => (
            <WorkspaceTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              root={node}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              editing={editing}
              draggingPath={draggingPath}
              dropTargetPath={dropTargetPath}
              onSelect={onSelect}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              onRename={onRename}
              onDelete={onDelete}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMove={onMove}
              onDropTargetChange={onDropTargetChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InlineRenameInput({
  initialValue,
  isNew,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  isNew: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const finish = (kind: "commit" | "cancel") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (kind === "commit") {
      onCommit(value);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      aria-label={isNew ? "Name new workspace item" : "Rename workspace item"}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          finish("commit");
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish("cancel");
        }
      }}
      onBlur={() => finish("commit")}
      style={renameInputStyle}
    />
  );
}

function WorkspaceContextMenu({
  state,
  rootPath,
  onClose,
  onNewFile,
  onNewFolder,
  onOpenFolder,
  onOpenFile,
  onRename,
  onDelete,
}: {
  state: ContextMenuState;
  rootPath: string | null;
  onClose: () => void;
  onNewFile: (parentPath?: string | null) => void;
  onNewFolder: (parentPath?: string | null) => void;
  onOpenFolder: () => void;
  onOpenFile: (node: WorkspaceNode) => void;
  onRename: (node: WorkspaceNode) => void;
  onDelete: (node: WorkspaceNode) => void;
}) {
  const node = state.node;
  const folderPath = node?.type === "folder" ? node.path : node?.parentPath ?? rootPath;
  const canMutateNode = !!node?.parentPath;

  const run = (callback: () => void) => {
    callback();
    onClose();
  };

  return (
    <div
      style={{ ...contextMenuStyle, left: state.x, top: state.y }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {node?.type === "file" && (
        <ContextMenuButton label="Open" onClick={() => run(() => onOpenFile(node))} />
      )}
      {folderPath && (
        <>
          <ContextMenuButton label="New File" onClick={() => run(() => onNewFile(folderPath))} />
          <ContextMenuButton label="New Folder" onClick={() => run(() => onNewFolder(folderPath))} />
        </>
      )}
      <ContextMenuButton label="Open Folder..." onClick={() => run(onOpenFolder)} />
      {node && canMutateNode && (
        <>
          <div style={contextSeparatorStyle} />
          <ContextMenuButton label="Rename" onClick={() => run(() => onRename(node))} />
          <ContextMenuButton label="Delete" danger onClick={() => run(() => onDelete(node))} />
        </>
      )}
      {node && (
        <>
          <div style={contextSeparatorStyle} />
          <ContextMenuButton
            label="Copy Path"
            onClick={() => run(() => {
              void navigator.clipboard?.writeText(node.path);
            })}
          />
        </>
      )}
    </div>
  );
}

function ContextMenuButton({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...contextButtonStyle,
        color: danger ? "var(--danger)" : "var(--text-primary)",
      }}
    >
      {label}
    </button>
  );
}

function findNode(node: WorkspaceNode, targetPath: string): WorkspaceNode | null {
  if (sameWorkspacePath(node.path, targetPath)) return node;
  if (node.type === "folder") {
    for (const child of node.children) {
      const found = findNode(child, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function selectedTargetFolderPath(node: WorkspaceNode | null): string | null {
  if (!node) return null;
  if (node.type === "folder") return node.path;
  return node.parentPath;
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\//g, "\\").toLowerCase();
}

function sameWorkspacePath(left: string, right: string): boolean {
  return normalizeWorkspacePath(left) === normalizeWorkspacePath(right);
}

function isSameOrDescendant(sourcePath: string, targetPath: string): boolean {
  const source = normalizeWorkspacePath(sourcePath).replace(/\\+$/, "");
  const target = normalizeWorkspacePath(targetPath).replace(/\\+$/, "");
  return target === source || target.startsWith(`${source}\\`);
}

const panelStyle: CSSProperties = {
  borderBottom: "1px solid var(--border-subtle)",
  display: "flex",
  flexDirection: "column",
  maxHeight: "45vh",
  flexShrink: 0,
};

const sectionHeaderRowStyle: CSSProperties = {
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  padding: "0 8px 0 0",
  flexShrink: 0,
};

const sectionHeaderButtonStyle: CSSProperties = {
  flex: 1,
  height: 32,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 0 8px 12px",
  background: "transparent",
  border: "none",
  borderRadius: 0,
  color: "var(--text-muted)",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
};

const sectionHeaderChevronStyle: CSSProperties = {
  color: "var(--text-muted)",
  transition: "transform 0.15s",
  flexShrink: 0,
};

const toolbarButtonGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
};

const toolbarIconButtonStyle: CSSProperties = {
  width: 22,
  height: 22,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const treeContainerStyle: CSSProperties = {
  flex: 1,
  minHeight: 80,
  maxHeight: "calc(45vh - 32px)",
  overflow: "auto",
  padding: "4px 0",
};

const treeRowStyle: CSSProperties = {
  height: 24,
  display: "flex",
  alignItems: "center",
  gap: 4,
  paddingRight: 8,
  color: "var(--text-secondary)",
  fontSize: 12,
  cursor: "default",
  userSelect: "none",
};

const chevronButtonStyle: CSSProperties = {
  width: 14,
  height: 18,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  lineHeight: 1,
  flexShrink: 0,
  transition: "transform 0.12s",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconStyle: CSSProperties = {
  width: 14,
  color: "var(--text-muted)",
  lineHeight: 1,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const nodeNameStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-secondary)",
};

const renameInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 20,
  padding: "1px 5px",
  background: "var(--panel-bg)",
  color: "var(--text-primary)",
  border: "1px solid var(--focus-color)",
  borderRadius: 0,
  fontSize: 12,
};

const contextMenuStyle: CSSProperties = {
  position: "fixed",
  zIndex: 200,
  minWidth: 168,
  padding: "4px 0",
  background: "var(--popup-bg)",
  border: "1px solid var(--border-color)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
};

const contextButtonStyle: CSSProperties = {
  width: "100%",
  display: "block",
  padding: "6px 12px",
  background: "transparent",
  border: "none",
  borderRadius: 0,
  textAlign: "left",
  fontSize: 12,
};

const contextSeparatorStyle: CSSProperties = {
  height: 1,
  margin: "4px 0",
  background: "var(--border-subtle)",
};

const workspaceInfoStyle: CSSProperties = {
  padding: "8px 12px",
  color: "var(--text-muted)",
  fontSize: 11,
  fontStyle: "italic",
};

const emptyWorkspaceStyle: CSSProperties = {
  padding: 12,
};

const emptyActionButtonStyle: CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  fontSize: 12,
};
