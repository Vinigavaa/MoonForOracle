import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { SavedConnection, SaveConnectionRequest, SavedConnectionWithPassword } from "@gavadb/types";

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
  version: 1;
  connections: StoredConnection[];
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
        const parsed = JSON.parse(raw) as StoreData;
        if (parsed.version === 1 && Array.isArray(parsed.connections)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error("[SavedConnectionsStore] Failed to load:", err);
    }
    return { version: 1, connections: [] };
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
}
