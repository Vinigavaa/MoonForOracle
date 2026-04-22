export type WorkspaceItemType = "file" | "folder";

interface WorkspaceNodeBase {
  id: string;
  name: string;
  path: string;
  parentPath: string | null;
  type: WorkspaceItemType;
}

export interface WorkspaceFileNode extends WorkspaceNodeBase {
  type: "file";
}

export interface WorkspaceFolderNode extends WorkspaceNodeBase {
  type: "folder";
  children: WorkspaceNode[];
}

export type WorkspaceNode = WorkspaceFileNode | WorkspaceFolderNode;

export interface WorkspaceTree {
  root: WorkspaceFolderNode | null;
}

export interface WorkspaceOperationResult {
  tree: WorkspaceTree;
  itemPath?: string;
}

export interface WorkspaceCreateItemRequest {
  parentPath: string;
  name?: string;
}

export interface WorkspaceRenameItemRequest {
  path: string;
  newName: string;
}

export interface WorkspaceMoveItemRequest {
  sourcePath: string;
  targetFolderPath: string;
}

export interface WorkspaceDeleteItemRequest {
  path: string;
}

export interface WorkspaceReadFileRequest {
  path: string;
}

export interface WorkspaceReadFileResponse {
  path: string;
  name: string;
  content: string;
}
