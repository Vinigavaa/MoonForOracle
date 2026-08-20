import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ConnectionFolder,
  MoveConnectionRequest,
  RenameConnectionFolderRequest,
  SavedConnection,
  SaveConnectionRequest,
  SavedConnectionWithPassword,
} from "@gavadb/types";

/**
 * Persistent store for saved Oracle connections.
 *
 * - Connection metadata is stored as JSON in userData/saved-connections.json
 * - Passwords are encrypted using Electron's safeStorage (OS credential store:
 *   DPAPI on Windows, Keychain on macOS, libsecret on Linux)
 * - Passwords are stored as base64-encoded encrypted buffers alongside the
 *   metadata, but are only decryptable by this app on this machine.
 */

interface StoredConnection extends SavedConnection {
  /** Base64-encoded encrypted password (via safeStorage) */
  encryptedPassword?: string;
}

interface StoreData {
  version: 2;
  connections: StoredConnection[];
  folders: ConnectionFolder[];
}

export class SavedConnectionsStore {
  private filePath: string;
  private data: StoreData;

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "saved-connections.json");
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as {
          version?: number;
          connections?: StoredConnection[];
          folders?: ConnectionFolder[];
        };
        if ((parsed.version === 1 || parsed.version === 2) && Array.isArray(parsed.connections)) {
          const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
          const folderIds = new Set(folders.map((folder) => folder.id));
          return {
            version: 2,
            folders,
            connections: parsed.connections.map((connection) => ({
              ...connection,
              folderId: connection.folderId && folderIds.has(connection.folderId) ? connection.folderId : null,
            })),
          };
        }
      }
    } catch (err) {
      console.error("[SavedConnectionsStore] Failed to load:", err);
    }
    return { version: 2, connections: [], folders: [] };
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (err) {
      console.error("[SavedConnectionsStore] Failed to persist:", err);
      throw { code: "UNKNOWN", message: "Failed to save connection data to disk." };
    }
  }

  private encryptPassword(password: string): string | undefined {
    if (!password) return undefined;
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(password);
      return encrypted.toString("base64");
    }
    // Fallback: base64 encode (not secure, but functional — warns in logs)
    console.warn("[SavedConnectionsStore] safeStorage not available, password stored with basic encoding only.");
    return Buffer.from(`plain:${password}`).toString("base64");
  }

  private decryptPassword(encryptedBase64: string | undefined): string | undefined {
    if (!encryptedBase64) return undefined;
    const buf = Buffer.from(encryptedBase64, "base64");
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buf);
      } catch {
        console.warn("[SavedConnectionsStore] Failed to decrypt password — may have been stored on different machine.");
        return undefined;
      }
    }
    // Fallback decode
    const decoded = buf.toString("utf-8");
    if (decoded.startsWith("plain:")) return decoded.slice(6);
    return undefined;
  }

  listAll(): SavedConnection[] {
    // Return without encryptedPassword — sort favorites first, then by lastUsedAt
    return this.data.connections
      .map(({ encryptedPassword: _, ...conn }) => conn)
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        const aTime = a.lastUsedAt ?? a.createdAt;
        const bTime = b.lastUsedAt ?? b.createdAt;
        return bTime.localeCompare(aTime);
      });
  }

  listFolders(): ConnectionFolder[] {
    return [...this.data.folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  createFolder(name: string): ConnectionFolder {
    const normalizedName = this.validateFolderName(name);
    const now = new Date().toISOString();
    const folder: ConnectionFolder = {
      id: randomUUID(),
      name: normalizedName,
      createdAt: now,
      updatedAt: now,
    };
    this.data.folders.push(folder);
    this.persist();
    return folder;
  }

  renameFolder(request: RenameConnectionFolderRequest): ConnectionFolder {
    const folder = this.data.folders.find((item) => item.id === request.id);
    if (!folder) {
      throw { code: "OBJECT_NOT_FOUND", message: `Connection folder "${request.id}" not found.` };
    }
    folder.name = this.validateFolderName(request.name, request.id);
    folder.updatedAt = new Date().toISOString();
    this.persist();
    return { ...folder };
  }

  deleteFolder(id: string): void {
    const index = this.data.folders.findIndex((folder) => folder.id === id);
    if (index < 0) {
      throw { code: "OBJECT_NOT_FOUND", message: `Connection folder "${id}" not found.` };
    }
    this.data.folders.splice(index, 1);
    for (const connection of this.data.connections) {
      if (connection.folderId === id) connection.folderId = null;
    }
    this.persist();
  }

  moveConnection(request: MoveConnectionRequest): SavedConnection {
    const connection = this.data.connections.find((item) => item.id === request.connectionId);
    if (!connection) {
      throw { code: "OBJECT_NOT_FOUND", message: `Saved connection "${request.connectionId}" not found.` };
    }
    if (request.folderId !== null && !this.data.folders.some((folder) => folder.id === request.folderId)) {
      throw { code: "OBJECT_NOT_FOUND", message: `Connection folder "${request.folderId}" not found.` };
    }
    connection.folderId = request.folderId;
    connection.updatedAt = new Date().toISOString();
    this.persist();
    const { encryptedPassword: _, ...result } = connection;
    return result;
  }

  getWithPassword(id: string): SavedConnectionWithPassword {
    const stored = this.data.connections.find((c) => c.id === id);
    if (!stored) {
      throw { code: "OBJECT_NOT_FOUND", message: `Saved connection "${id}" not found.` };
    }
    const { encryptedPassword, ...conn } = stored;
    return { ...conn, password: this.decryptPassword(encryptedPassword) };
  }

  save(request: SaveConnectionRequest): SavedConnection {
    const { connection, password } = request;
    const existingIdx = this.data.connections.findIndex((c) => c.id === connection.id);

    const stored: StoredConnection = {
      ...connection,
      folderId: connection.folderId && this.data.folders.some((folder) => folder.id === connection.folderId)
        ? connection.folderId
        : null,
      updatedAt: new Date().toISOString(),
    };

    if (password !== undefined) {
      stored.encryptedPassword = this.encryptPassword(password);
    } else if (existingIdx >= 0) {
      // Keep existing password
      stored.encryptedPassword = this.data.connections[existingIdx].encryptedPassword;
    }

    if (existingIdx >= 0) {
      this.data.connections[existingIdx] = stored;
    } else {
      stored.createdAt = stored.createdAt || new Date().toISOString();
      this.data.connections.push(stored);
    }

    this.persist();
    const { encryptedPassword: _, ...result } = stored;
    return result;
  }

  delete(id: string): void {
    const idx = this.data.connections.findIndex((c) => c.id === id);
    if (idx < 0) {
      throw { code: "OBJECT_NOT_FOUND", message: `Saved connection "${id}" not found.` };
    }
    this.data.connections.splice(idx, 1);
    this.persist();
  }

  toggleFavorite(id: string): SavedConnection {
    const stored = this.data.connections.find((c) => c.id === id);
    if (!stored) {
      throw { code: "OBJECT_NOT_FOUND", message: `Saved connection "${id}" not found.` };
    }
    stored.isFavorite = !stored.isFavorite;
    stored.updatedAt = new Date().toISOString();
    this.persist();
    const { encryptedPassword: _, ...result } = stored;
    return result;
  }

  updateLastUsed(id: string): void {
    const stored = this.data.connections.find((c) => c.id === id);
    if (!stored) return;
    stored.lastUsedAt = new Date().toISOString();
    this.persist();
  }

  private validateFolderName(name: string, currentId?: string): string {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw { code: "INVALID_NAME", message: "Folder name cannot be empty." };
    }
    if (normalizedName.length > 80) {
      throw { code: "INVALID_NAME", message: "Folder name cannot exceed 80 characters." };
    }
    const duplicate = this.data.folders.some(
      (folder) => folder.id !== currentId && folder.name.localeCompare(normalizedName, undefined, { sensitivity: "base" }) === 0,
    );
    if (duplicate) {
      throw { code: "INVALID_NAME", message: `A folder named "${normalizedName}" already exists.` };
    }
    return normalizedName;
  }
}
