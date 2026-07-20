import fs from "node:fs";
import path from "node:path";
import type {
  AppError,
  ThemeDeleteRequest,
  ThemeDuplicateRequest,
  ThemeFileEntry,
  ThemeListResponse,
  ThemeRenameRequest,
  ThemeSaveRequest,
  ThemeSetDefaultRequest,
} from "@gavadb/types";

interface ThemePreferences {
  defaultThemeFileName?: string | null;
}

const PREFS_FILE = "theme-preferences.json";
const THEMES_FOLDER_SEGMENTS = ["GavaDb", "Themes"];
const SCHEMA_VERSION = 1;

export class ThemeService {
  private readonly folderPath: string;
  private readonly preferencesPath: string;

  constructor(
    private readonly userDataPath: string,
    documentsPath: string,
  ) {
    this.folderPath = path.join(documentsPath, ...THEMES_FOLDER_SEGMENTS);
    this.preferencesPath = path.join(userDataPath, PREFS_FILE);
  }

  getFolderPath(): string {
    return this.folderPath;
  }

  async ensureFolder(): Promise<string> {
    await fs.promises.mkdir(this.folderPath, { recursive: true });
    return this.folderPath;
  }

  async listThemes(): Promise<ThemeListResponse> {
    const folderPath = await this.ensureFolder();
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    } catch {
      entries = [];
    }

    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"));
    const themes: ThemeFileEntry[] = [];
    for (const file of jsonFiles) {
      try {
        themes.push(await this.readThemeFile(path.join(folderPath, file.name)));
      } catch {
        // Skip malformed/unreadable theme files instead of failing the whole list.
      }
    }
    themes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    const preferences = await this.loadPreferences();
    const defaultThemeFileName = preferences.defaultThemeFileName
      && themes.some((theme) => theme.fileName === preferences.defaultThemeFileName)
      ? preferences.defaultThemeFileName
      : null;

    return { themes, folderPath, defaultThemeFileName };
  }

  async createTheme(request: ThemeSaveRequest): Promise<ThemeListResponse> {
    const folderPath = await this.ensureFolder();
    const name = request.name.trim();
    if (!name) {
      throw themeError("INVALID_NAME", "Theme name cannot be empty.");
    }

    const fileName = await this.pickUniqueFileName(folderPath, slugify(name));
    await this.writeThemeFile(folderPath, fileName, name, request.theme);
    return this.listThemes();
  }

  async renameTheme(request: ThemeRenameRequest): Promise<ThemeListResponse> {
    const folderPath = await this.ensureFolder();
    const newName = request.newName.trim();
    if (!newName) {
      throw themeError("INVALID_NAME", "Theme name cannot be empty.");
    }

    const sourcePath = await this.requireExistingThemeFile(folderPath, request.fileName);
    const existing = await this.readThemeFile(sourcePath);
    const newFileName = await this.pickUniqueFileName(folderPath, slugify(newName), request.fileName);
    const targetPath = path.join(folderPath, newFileName);

    await this.writeThemeFile(folderPath, newFileName, newName, existing.theme, existing.createdAt);
    if (path.basename(sourcePath) !== path.basename(targetPath)) {
      await fs.promises.rm(sourcePath, { force: true });
    }
    await this.remapDefaultThemeFileName(request.fileName, newFileName);

    return this.listThemes();
  }

  async deleteTheme(request: ThemeDeleteRequest): Promise<ThemeListResponse> {
    const folderPath = await this.ensureFolder();
    const targetPath = await this.requireExistingThemeFile(folderPath, request.fileName);
    await fs.promises.rm(targetPath, { force: true });
    await this.remapDefaultThemeFileName(request.fileName, null);
    return this.listThemes();
  }

  async duplicateTheme(request: ThemeDuplicateRequest): Promise<ThemeListResponse> {
    const folderPath = await this.ensureFolder();
    const sourcePath = await this.requireExistingThemeFile(folderPath, request.fileName);
    const existing = await this.readThemeFile(sourcePath);
    const newName = (request.name?.trim() || `${existing.name} Copy`);
    const newFileName = await this.pickUniqueFileName(folderPath, slugify(newName));

    await this.writeThemeFile(folderPath, newFileName, newName, existing.theme);
    return this.listThemes();
  }

  async setDefaultTheme(request: ThemeSetDefaultRequest): Promise<ThemeListResponse> {
    const folderPath = await this.ensureFolder();
    if (request.fileName) {
      await this.requireExistingThemeFile(folderPath, request.fileName);
    }
    await this.savePreferences({ defaultThemeFileName: request.fileName });
    return this.listThemes();
  }

  async importThemeFile(sourcePath: string): Promise<ThemeListResponse> {
    const folderPath = await this.ensureFolder();

    let raw: string;
    try {
      raw = await fs.promises.readFile(sourcePath, "utf8");
    } catch {
      throw themeError("OBJECT_NOT_FOUND", "The selected file could not be read.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw themeError("INVALID_OPERATION", "The selected file is not valid JSON.");
    }

    if (!parsed || typeof parsed !== "object") {
      throw themeError("INVALID_OPERATION", "The selected file is not a valid theme.");
    }

    const obj = parsed as Record<string, unknown>;
    const hasEnvelope = "theme" in obj && !!obj.theme && typeof obj.theme === "object";
    const theme = (hasEnvelope ? obj.theme : obj) as Record<string, unknown>;
    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const name = hasEnvelope && typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim()
      : fileNameToTitle(baseName);

    const fileName = await this.pickUniqueFileName(folderPath, slugify(name));
    await this.writeThemeFile(folderPath, fileName, name, theme);
    return this.listThemes();
  }

  async exportThemeFile(fileName: string, destPath: string): Promise<void> {
    const folderPath = await this.ensureFolder();
    const sourcePath = await this.requireExistingThemeFile(folderPath, fileName);
    await fs.promises.copyFile(sourcePath, destPath);
  }

  private async readThemeFile(filePath: string): Promise<ThemeFileEntry> {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fileName = path.basename(filePath);
    const stats = await fs.promises.stat(filePath);

    const hasEnvelope = parsed && typeof parsed === "object" && "theme" in parsed
      && !!parsed.theme && typeof parsed.theme === "object";

    if (hasEnvelope) {
      return {
        fileName,
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : fileNameToTitle(fileName),
        theme: parsed.theme as Record<string, unknown>,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : stats.birthtime.toISOString(),
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : stats.mtime.toISOString(),
      };
    }

    return {
      fileName,
      name: fileNameToTitle(fileName),
      theme: parsed,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
    };
  }

  private async writeThemeFile(
    folderPath: string,
    fileName: string,
    name: string,
    theme: Record<string, unknown>,
    createdAt?: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      name,
      theme,
      createdAt: createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await fs.promises.writeFile(path.join(folderPath, fileName), JSON.stringify(envelope, null, 2), "utf8");
  }

  private async requireExistingThemeFile(folderPath: string, fileName: string): Promise<string> {
    const safeName = path.basename(fileName);
    if (safeName !== fileName || !safeName.toLowerCase().endsWith(".json")) {
      throw themeError("INVALID_OPERATION", "Invalid theme file name.");
    }

    const targetPath = path.join(folderPath, safeName);
    try {
      const stats = await fs.promises.stat(targetPath);
      if (!stats.isFile()) throw new Error("not a file");
    } catch {
      throw themeError("OBJECT_NOT_FOUND", "The selected theme no longer exists.");
    }
    return targetPath;
  }

  private async pickUniqueFileName(folderPath: string, baseSlug: string, ignoreFileName?: string): Promise<string> {
    const slug = baseSlug || "theme";
    let candidate = `${slug}.json`;
    let counter = 2;
    while (candidate !== ignoreFileName && await pathExists(path.join(folderPath, candidate))) {
      candidate = `${slug}-${counter}.json`;
      counter += 1;
    }
    return candidate;
  }

  private async remapDefaultThemeFileName(oldFileName: string, newFileName: string | null): Promise<void> {
    const preferences = await this.loadPreferences();
    if (preferences.defaultThemeFileName === oldFileName) {
      await this.savePreferences({ defaultThemeFileName: newFileName });
    }
  }

  private async loadPreferences(): Promise<ThemePreferences> {
    try {
      const raw = await fs.promises.readFile(this.preferencesPath, "utf8");
      return JSON.parse(raw) as ThemePreferences;
    } catch {
      return {};
    }
  }

  private async savePreferences(preferences: ThemePreferences): Promise<void> {
    await fs.promises.mkdir(this.userDataPath, { recursive: true });
    await fs.promises.writeFile(this.preferencesPath, JSON.stringify(preferences, null, 2), "utf8");
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return base || "theme";
}

function fileNameToTitle(fileNameOrBase: string): string {
  const base = fileNameOrBase.replace(/\.json$/i, "");
  const spaced = base.replace(/[-_]+/g, " ").trim();
  const titled = spaced.replace(/\b\w/g, (c) => c.toUpperCase());
  return titled || "Theme";
}

function themeError(code: AppError["code"], message: string): AppError {
  return { code, message };
}
