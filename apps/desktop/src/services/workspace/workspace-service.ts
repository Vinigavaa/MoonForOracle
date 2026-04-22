import fs from "node:fs";
import path from "node:path";
import type {
  AppError,
  WorkspaceCreateItemRequest,
  WorkspaceDeleteItemRequest,
  WorkspaceFileNode,
  WorkspaceFolderNode,
  WorkspaceMoveItemRequest,
  WorkspaceNode,
  WorkspaceOperationResult,
  WorkspaceReadFileRequest,
  WorkspaceReadFileResponse,
  WorkspaceRenameItemRequest,
  WorkspaceTree,
} from "@gavadb/types";

interface WorkspacePreferences {
  rootPath?: string;
}

const PREFS_FILE = "workspace-preferences.json";
const DEFAULT_WORKSPACE_NAME = "Moon Queries";
const DEFAULT_FILE_NAME = "New File.sql";
const DEFAULT_FOLDER_NAME = "New Folder";
const MAX_READ_FILE_BYTES = 5 * 1024 * 1024;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const INVALID_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;

export class WorkspaceService {
  private readonly preferencesPath: string;

  constructor(
    private readonly userDataPath: string,
    private readonly documentsPath: string,
  ) {
    this.preferencesPath = path.join(userDataPath, PREFS_FILE);
  }

  async getTree(): Promise<WorkspaceTree> {
    const rootPath = await this.getOrCreateRootPath();
    return this.buildTree(rootPath);
  }

  async setRoot(rootPath: string): Promise<WorkspaceTree> {
    const resolved = path.resolve(rootPath);
    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) {
      throw workspaceError("INVALID_OPERATION", "The selected path is not a folder.");
    }

    await this.savePreferences({ rootPath: resolved });
    return this.buildTree(resolved);
  }

  async createFolder(request: WorkspaceCreateItemRequest): Promise<WorkspaceOperationResult> {
    const rootPath = await this.getOrCreateRootPath();
    const parentPath = await this.requireFolderInsideRoot(rootPath, request.parentPath);
    const name = await this.pickUniqueName(parentPath, sanitizeRequestedName(request.name) || DEFAULT_FOLDER_NAME);
    const targetPath = path.join(parentPath, name);

    await fs.promises.mkdir(targetPath);
    return { tree: await this.buildTree(rootPath), itemPath: targetPath };
  }

  async createFile(request: WorkspaceCreateItemRequest): Promise<WorkspaceOperationResult> {
    const rootPath = await this.getOrCreateRootPath();
    const parentPath = await this.requireFolderInsideRoot(rootPath, request.parentPath);
    const name = await this.pickUniqueName(parentPath, sanitizeRequestedName(request.name) || DEFAULT_FILE_NAME);
    const targetPath = path.join(parentPath, name);

    await fs.promises.writeFile(targetPath, "", { encoding: "utf8", flag: "wx" });
    return { tree: await this.buildTree(rootPath), itemPath: targetPath };
  }

  async renameItem(request: WorkspaceRenameItemRequest): Promise<WorkspaceOperationResult> {
    const rootPath = await this.getOrCreateRootPath();
    const sourcePath = await this.requirePathInsideRoot(rootPath, request.path);
    const parentPath = path.dirname(sourcePath);
    const newName = sanitizeRequestedName(request.newName);
    this.validateName(newName);

    const targetPath = path.join(parentPath, newName);
    if (samePath(sourcePath, targetPath)) {
      return { tree: await this.buildTree(rootPath), itemPath: sourcePath };
    }

    await this.ensurePathDoesNotExist(targetPath);
    await fs.promises.rename(sourcePath, targetPath);

    if (samePath(sourcePath, rootPath)) {
      await this.savePreferences({ rootPath: targetPath });
      return { tree: await this.buildTree(targetPath), itemPath: targetPath };
    }

    return { tree: await this.buildTree(rootPath), itemPath: targetPath };
  }

  async moveItem(request: WorkspaceMoveItemRequest): Promise<WorkspaceOperationResult> {
    const rootPath = await this.getOrCreateRootPath();
    const sourcePath = await this.requirePathInsideRoot(rootPath, request.sourcePath);
    const targetFolderPath = await this.requireFolderInsideRoot(rootPath, request.targetFolderPath);

    if (samePath(sourcePath, rootPath)) {
      throw workspaceError("INVALID_OPERATION", "The workspace root cannot be moved.");
    }

    const stats = await fs.promises.stat(sourcePath);
    if (stats.isDirectory() && isInsideOrEqual(sourcePath, targetFolderPath)) {
      throw workspaceError("INVALID_OPERATION", "A folder cannot be moved into itself or one of its descendants.");
    }

    const targetPath = path.join(targetFolderPath, path.basename(sourcePath));
    if (samePath(sourcePath, targetPath)) {
      return { tree: await this.buildTree(rootPath), itemPath: sourcePath };
    }

    await this.ensurePathDoesNotExist(targetPath);
    await fs.promises.rename(sourcePath, targetPath);
    return { tree: await this.buildTree(rootPath), itemPath: targetPath };
  }

  async deleteItem(request: WorkspaceDeleteItemRequest): Promise<WorkspaceOperationResult> {
    const rootPath = await this.getOrCreateRootPath();
    const targetPath = await this.requirePathInsideRoot(rootPath, request.path);
    if (samePath(targetPath, rootPath)) {
      throw workspaceError("INVALID_OPERATION", "The workspace root cannot be deleted.");
    }

    await fs.promises.rm(targetPath, { recursive: true, force: false });
    return { tree: await this.buildTree(rootPath) };
  }

  async readFile(request: WorkspaceReadFileRequest): Promise<WorkspaceReadFileResponse> {
    const rootPath = await this.getOrCreateRootPath();
    const filePath = await this.requirePathInsideRoot(rootPath, request.path);
    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      throw workspaceError("INVALID_OPERATION", "Only files can be opened.");
    }
    if (stats.size > MAX_READ_FILE_BYTES) {
      throw workspaceError("INVALID_OPERATION", "This file is too large to open in the SQL editor.");
    }

    const content = await fs.promises.readFile(filePath, "utf8");
    return {
      path: filePath,
      name: path.basename(filePath),
      content,
    };
  }

  private async getOrCreateRootPath(): Promise<string> {
    const preferences = await this.loadPreferences();
    if (preferences.rootPath) {
      try {
        const stats = await fs.promises.stat(preferences.rootPath);
        if (stats.isDirectory()) return path.resolve(preferences.rootPath);
      } catch {
        // Fall through and recreate the default workspace.
      }
    }

    const defaultRoot = path.join(this.documentsPath, DEFAULT_WORKSPACE_NAME);
    await fs.promises.mkdir(defaultRoot, { recursive: true });
    await this.savePreferences({ rootPath: defaultRoot });
    return defaultRoot;
  }

  private async buildTree(rootPath: string): Promise<WorkspaceTree> {
    return {
      root: await this.readFolderNode(path.resolve(rootPath), null),
    };
  }

  private async readFolderNode(folderPath: string, parentPath: string | null): Promise<WorkspaceFolderNode> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    } catch {
      entries = [];
    }
    const sorted = entries
      .filter((entry) => !entry.isSymbolicLink())
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

    const children: WorkspaceNode[] = [];
    for (const entry of sorted) {
      const itemPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        try {
          children.push(await this.readFolderNode(itemPath, folderPath));
        } catch {
          // Keep the workspace usable if a nested folder disappears or denies access.
        }
      } else if (entry.isFile()) {
        children.push(this.readFileNode(itemPath, folderPath));
      }
    }

    return {
      id: normalizeId(folderPath),
      name: path.basename(folderPath),
      path: folderPath,
      parentPath,
      type: "folder",
      children,
    };
  }

  private readFileNode(filePath: string, parentPath: string): WorkspaceFileNode {
    return {
      id: normalizeId(filePath),
      name: path.basename(filePath),
      path: filePath,
      parentPath,
      type: "file",
    };
  }

  private async requirePathInsideRoot(rootPath: string, candidatePath: string): Promise<string> {
    const resolved = path.resolve(candidatePath);
    if (!isInsideOrEqual(rootPath, resolved)) {
      throw workspaceError("INVALID_OPERATION", "The selected path is outside the current workspace.");
    }

    try {
      await fs.promises.stat(resolved);
      return resolved;
    } catch {
      throw workspaceError("OBJECT_NOT_FOUND", "The selected item no longer exists.");
    }
  }

  private async requireFolderInsideRoot(rootPath: string, candidatePath: string): Promise<string> {
    const resolved = await this.requirePathInsideRoot(rootPath, candidatePath);
    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) {
      throw workspaceError("INVALID_OPERATION", "The target location is not a folder.");
    }
    return resolved;
  }

  private async pickUniqueName(parentPath: string, preferredName: string): Promise<string> {
    this.validateName(preferredName);

    const parsed = path.parse(preferredName);
    const base = parsed.name || preferredName;
    const ext = parsed.ext;
    let candidate = preferredName;
    let counter = 1;

    while (await pathExists(path.join(parentPath, candidate))) {
      candidate = `${base} ${counter}${ext}`;
      counter += 1;
    }

    return candidate;
  }

  private validateName(name: string): void {
    if (!name || name === "." || name === "..") {
      throw workspaceError("INVALID_NAME", "Name cannot be empty.");
    }
    if (INVALID_NAME_CHARS.test(name) || name.endsWith(".") || name.endsWith(" ") || WINDOWS_RESERVED_NAMES.test(name)) {
      throw workspaceError("INVALID_NAME", "Name contains invalid characters.");
    }
  }

  private async ensurePathDoesNotExist(targetPath: string): Promise<void> {
    if (await pathExists(targetPath)) {
      throw workspaceError("PATH_CONFLICT", "An item with this name already exists in the target folder.");
    }
  }

  private async loadPreferences(): Promise<WorkspacePreferences> {
    try {
      const raw = await fs.promises.readFile(this.preferencesPath, "utf8");
      return JSON.parse(raw) as WorkspacePreferences;
    } catch {
      return {};
    }
  }

  private async savePreferences(preferences: WorkspacePreferences): Promise<void> {
    await fs.promises.mkdir(this.userDataPath, { recursive: true });
    await fs.promises.writeFile(this.preferencesPath, JSON.stringify(preferences, null, 2), "utf8");
  }
}

function sanitizeRequestedName(name: string | undefined): string {
  return (name ?? "").trim();
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeId(value: string): string {
  return path.resolve(value);
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isInsideOrEqual(rootPath: string, candidatePath: string): boolean {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function workspaceError(code: AppError["code"], message: string, details?: string): AppError {
  return { code, message, details };
}
