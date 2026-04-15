import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { DatabaseRepository } from "@gavadb/oracle";
import type {
  QueryExportColumn,
  QueryExportFormat,
  QueryExportProgress,
  QueryExportRequest,
  QueryExportResponse,
  QueryResultColumn,
  QueryResultRow,
} from "@gavadb/types";
import { writeStoredZip } from "./zip-writer";

const EXPORT_PAGE_SIZE = 500;
const MAX_XLSX_COLUMN_WIDTH = 60;

interface ExportWriter {
  writeRows(rows: QueryResultRow[]): Promise<void>;
  finalize(): Promise<void>;
}

export class QueryExportService {
  constructor(private readonly repo: DatabaseRepository) {}

  async exportQueryResult(
    request: QueryExportRequest,
    filePath: string,
    onProgress: (progress: QueryExportProgress) => void,
  ): Promise<QueryExportResponse> {
    const columns = normalizeExportColumns(request.columns);
    if (columns.length === 0) {
      throw new Error("No visible columns available to export.");
    }

    const writer = await createExportWriter(request.format, filePath, columns, request);
    let rowsExported = 0;
    let chunksProcessed = 0;
    let offset = 0;

    onProgress({
      exportId: request.exportId,
      format: request.format,
      stage: "preparing",
      rowsProcessed: 0,
      chunksProcessed: 0,
      message: `Preparing ${request.format.toUpperCase()} export...`,
      filePath,
    });

    try {
      while (true) {
        onProgress({
          exportId: request.exportId,
          format: request.format,
          stage: "fetching",
          rowsProcessed: rowsExported,
          chunksProcessed,
          message: `Fetching rows starting at ${offset.toLocaleString()}...`,
          filePath,
        });

        const page = await this.repo.executeQuery({
          sql: request.sql,
          binds: request.binds,
          orderBy: request.orderBy,
          pageSize: EXPORT_PAGE_SIZE,
          offset,
        });

        if (page.statementType !== "select") {
          throw new Error("Only SELECT query results can be exported.");
        }

        onProgress({
          exportId: request.exportId,
          format: request.format,
          stage: "writing",
          rowsProcessed: rowsExported,
          chunksProcessed,
          message: `Writing chunk ${chunksProcessed + 1}...`,
          filePath,
        });

        await writer.writeRows(page.rows);
        rowsExported += page.rows.length;
        chunksProcessed += 1;

        if (!page.hasMore || page.rows.length === 0) {
          break;
        }

        offset += page.rows.length;
        await yieldToEventLoop();
      }

      onProgress({
        exportId: request.exportId,
        format: request.format,
        stage: "finalizing",
        rowsProcessed: rowsExported,
        chunksProcessed,
        message: "Finalizing exported file...",
        filePath,
      });

      await writer.finalize();

      onProgress({
        exportId: request.exportId,
        format: request.format,
        stage: "completed",
        rowsProcessed: rowsExported,
        chunksProcessed,
        message: `Export completed with ${rowsExported.toLocaleString()} row(s).`,
        filePath,
      });

      return {
        exportId: request.exportId,
        canceled: false,
        filePath,
        format: request.format,
        rowsExported,
      };
    } catch (error) {
      await fs.promises.rm(filePath, { force: true });
      onProgress({
        exportId: request.exportId,
        format: request.format,
        stage: "error",
        rowsProcessed: rowsExported,
        chunksProcessed,
        message: error instanceof Error ? error.message : String(error),
        filePath,
      });
      throw error;
    }
  }
}

async function createExportWriter(
  format: QueryExportFormat,
  filePath: string,
  columns: QueryExportColumn[],
  request: QueryExportRequest,
): Promise<ExportWriter> {
  if (format === "csv") {
    return CsvExportWriter.create(filePath, columns, request.delimiter ?? ";");
  }
  return XlsxExportWriter.create(filePath, columns, request.autoFitColumns !== false);
}

function normalizeExportColumns(columns: QueryExportColumn[]): QueryExportColumn[] {
  return columns.filter((column) => column.visible !== false);
}

class CsvExportWriter implements ExportWriter {
  private constructor(
    private readonly stream: fs.WriteStream,
    private readonly columns: QueryExportColumn[],
    private readonly delimiter: string,
  ) {}

  static async create(filePath: string, columns: QueryExportColumn[], delimiter: string): Promise<CsvExportWriter> {
    if (!delimiter) {
      throw new Error("CSV delimiter cannot be empty.");
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
    const writer = new CsvExportWriter(stream, columns, delimiter);
    await writeStreamChunk(stream, "\ufeff");
    await writer.writeLine(columns.map((column) => stringifyCsvField(column.label, column, delimiter)));
    return writer;
  }

  async writeRows(rows: QueryResultRow[]): Promise<void> {
    for (const row of rows) {
      await this.writeLine(this.columns.map((column) => stringifyCsvField(row[column.key], column, this.delimiter)));
    }
  }

  async finalize(): Promise<void> {
    this.stream.end();
    await once(this.stream, "close");
  }

  private async writeLine(fields: string[]): Promise<void> {
    const line = `${fields.join(this.delimiter)}\r\n`;
    if (!this.stream.write(line, "utf8")) {
      await once(this.stream, "drain");
    }
  }
}

class XlsxExportWriter implements ExportWriter {
  private rowCount = 1;
  private readonly tempDir: string;
  private readonly rowsPath: string;
  private readonly sheetPath: string;
  private readonly rowsStream: fs.WriteStream;
  private readonly widths: number[];

  private constructor(
    private readonly outputPath: string,
    private readonly columns: QueryExportColumn[],
    private readonly autoFitColumns: boolean,
    tempDir: string,
  ) {
    this.tempDir = tempDir;
    this.rowsPath = path.join(tempDir, "sheet-data.xml");
    this.sheetPath = path.join(tempDir, "sheet1.xml");
    this.rowsStream = fs.createWriteStream(this.rowsPath, { encoding: "utf8" });
    this.widths = columns.map((column) => Math.min(MAX_XLSX_COLUMN_WIDTH, Math.max(8, column.label.length + 2)));
  }

  static async create(outputPath: string, columns: QueryExportColumn[], autoFitColumns: boolean): Promise<XlsxExportWriter> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gavadb-export-"));
    const writer = new XlsxExportWriter(outputPath, columns, autoFitColumns, tempDir);
    await writer.writeHeaderRow();
    return writer;
  }

  async writeRows(rows: QueryResultRow[]): Promise<void> {
    for (const row of rows) {
      this.rowCount += 1;
      const cells: string[] = [];
      for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex += 1) {
        const column = this.columns[columnIndex];
        const cell = toXlsxCell(row[column.key], column, this.rowCount, columnIndex);
        if (this.autoFitColumns) {
          this.widths[columnIndex] = Math.min(
            MAX_XLSX_COLUMN_WIDTH,
            Math.max(this.widths[columnIndex], cell.displayWidth),
          );
        }
        if (cell.xml) {
          cells.push(cell.xml);
        }
      }
      await writeStreamChunk(this.rowsStream, `<row r="${this.rowCount}">${cells.join("")}</row>`);
    }
  }

  async finalize(): Promise<void> {
    try {
      this.rowsStream.end();
      await once(this.rowsStream, "close");
      await this.buildSheetXml();
      await this.writeSupportingFiles();
      await writeStoredZip([
        { name: "[Content_Types].xml", sourcePath: path.join(this.tempDir, "[Content_Types].xml") },
        { name: "_rels/.rels", sourcePath: path.join(this.tempDir, "_rels", ".rels") },
        { name: "docProps/app.xml", sourcePath: path.join(this.tempDir, "docProps", "app.xml") },
        { name: "docProps/core.xml", sourcePath: path.join(this.tempDir, "docProps", "core.xml") },
        { name: "xl/workbook.xml", sourcePath: path.join(this.tempDir, "xl", "workbook.xml") },
        { name: "xl/styles.xml", sourcePath: path.join(this.tempDir, "xl", "styles.xml") },
        { name: "xl/_rels/workbook.xml.rels", sourcePath: path.join(this.tempDir, "xl", "_rels", "workbook.xml.rels") },
        { name: "xl/worksheets/sheet1.xml", sourcePath: this.sheetPath },
      ], this.outputPath);
    } finally {
      await fs.promises.rm(this.tempDir, { recursive: true, force: true });
    }
  }

  private async writeHeaderRow(): Promise<void> {
    const cells = this.columns.map((column, index) => {
      const cellRef = `${columnIndexToName(index)}1`;
      return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(column.label)}</t></is></c>`;
    });
    await writeStreamChunk(this.rowsStream, `<row r="1">${cells.join("")}</row>`);
  }

  private async buildSheetXml(): Promise<void> {
    const stream = fs.createWriteStream(this.sheetPath, { encoding: "utf8" });
    const colsXml = this.autoFitColumns
      ? `<cols>${this.widths.map((width, index) => (
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
      )).join("")}</cols>`
      : "";
    const prefix = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
      "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
      colsXml,
      "<sheetData>",
    ].join("");

    try {
      await writeStreamChunk(stream, prefix);
      await pipeFileToWriteStream(this.rowsPath, stream);
      await writeStreamChunk(stream, "</sheetData></worksheet>");
    } finally {
      stream.end();
      await once(stream, "close");
    }
  }

  private async writeSupportingFiles(): Promise<void> {
    const workbookDir = path.join(this.tempDir, "xl");
    await fs.promises.mkdir(path.join(this.tempDir, "_rels"), { recursive: true });
    await fs.promises.mkdir(path.join(this.tempDir, "docProps"), { recursive: true });
    await fs.promises.mkdir(path.join(workbookDir, "_rels"), { recursive: true });

    const now = new Date().toISOString();
    await fs.promises.writeFile(path.join(this.tempDir, "[Content_Types].xml"), buildContentTypesXml(), "utf8");
    await fs.promises.writeFile(path.join(this.tempDir, "_rels", ".rels"), buildRootRelsXml(), "utf8");
    await fs.promises.writeFile(path.join(this.tempDir, "docProps", "app.xml"), buildAppPropsXml(), "utf8");
    await fs.promises.writeFile(path.join(this.tempDir, "docProps", "core.xml"), buildCorePropsXml(now), "utf8");
    await fs.promises.writeFile(path.join(workbookDir, "workbook.xml"), buildWorkbookXml(), "utf8");
    await fs.promises.writeFile(path.join(workbookDir, "_rels", "workbook.xml.rels"), buildWorkbookRelsXml(), "utf8");
    await fs.promises.writeFile(path.join(workbookDir, "styles.xml"), buildStylesXml(), "utf8");
  }
}

function stringifyCsvField(value: unknown, column: QueryExportColumn, delimiter: string): string {
  const serialized = formatValueForExport(value, column).text;
  const escaped = serialized.replace(/"/g, "\"\"");
  if (escaped.includes(delimiter) || escaped.includes("\n") || escaped.includes("\r") || escaped.includes("\"")) {
    return `"${escaped}"`;
  }
  return escaped;
}

function toXlsxCell(value: unknown, column: QueryExportColumn, rowIndex: number, columnIndex: number): { xml: string; displayWidth: number } {
  const cellRef = `${columnIndexToName(columnIndex)}${rowIndex}`;
  const formatted = formatValueForExport(value, column);

  if (formatted.kind === "blank") {
    return { xml: "", displayWidth: 0 };
  }

  if (formatted.kind === "boolean") {
    return { xml: `<c r="${cellRef}" t="b"><v>${formatted.value ? 1 : 0}</v></c>`, displayWidth: 5 };
  }

  if (formatted.kind === "number") {
    return { xml: `<c r="${cellRef}"><v>${formatted.value}</v></c>`, displayWidth: formatted.displayWidth };
  }

  if (formatted.kind === "date") {
    return { xml: `<c r="${cellRef}" s="1"><v>${formatted.serial}</v></c>`, displayWidth: formatted.displayWidth };
  }

  return {
    xml: `<c r="${cellRef}" t="inlineStr"><is><t${requiresXmlSpacePreserve(formatted.text) ? " xml:space=\"preserve\"" : ""}>${escapeXml(formatted.text)}</t></is></c>`,
    displayWidth: formatted.displayWidth,
  };
}

function formatValueForExport(value: unknown, column: QueryExportColumn):
  | { kind: "blank"; text: ""; displayWidth: number }
  | { kind: "boolean"; value: boolean; text: string; displayWidth: number }
  | { kind: "number"; value: string; text: string; displayWidth: number }
  | { kind: "date"; serial: string; text: string; displayWidth: number }
  | { kind: "text"; text: string; displayWidth: number } {
  if (value == null) {
    return { kind: "blank", text: "", displayWidth: 0 };
  }

  if (typeof value === "boolean") {
    const text = value ? "TRUE" : "FALSE";
    return { kind: "boolean", value, text, displayWidth: text.length + 2 };
  }

  const dateValue = coerceDateValue(value, column.dataType);
  if (dateValue) {
    const text = formatDateForExport(dateValue);
    return {
      kind: "date",
      serial: toExcelSerial(dateValue).toString(),
      text,
      displayWidth: text.length + 2,
    };
  }

  if (typeof value === "number" && Number.isFinite(value) && isSafeExcelNumber(value)) {
    const text = String(value);
    return { kind: "number", value: text, text, displayWidth: text.length + 2 };
  }

  const text = stringifyExportValue(value);
  if (typeof value === "bigint") {
    return { kind: "text", text, displayWidth: text.length + 2 };
  }

  return { kind: "text", text, displayWidth: measureDisplayWidth(text) };
}

function isSafeExcelNumber(value: number): boolean {
  return !Number.isInteger(value) || Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

function coerceDateValue(value: unknown, dataType: string): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" && isDateColumn(dataType)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isDateColumn(dataType: string): boolean {
  const normalized = dataType.toUpperCase();
  return normalized === "DATE" || normalized.startsWith("TIMESTAMP");
}

function formatDateForExport(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  if (hour === "00" && minute === "00" && second === "00") {
    return `${year}-${month}-${day}`;
  }
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function toExcelSerial(date: Date): number {
  const excelEpoch = Date.UTC(1899, 11, 30);
  return (date.getTime() - excelEpoch) / 86_400_000;
}

function stringifyExportValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return formatDateForExport(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString("base64");
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
  if (Array.isArray(value)) return safeJsonStringify(value);
  if (typeof value === "object") return safeJsonStringify(value);
  return String(value);
}

function measureDisplayWidth(text: string): number {
  const longestLine = text.split(/\r?\n/).reduce((max, line) => Math.max(max, line.length), 0);
  return Math.min(MAX_XLSX_COLUMN_WIDTH, Math.max(8, longestLine + 2));
}

function columnIndexToName(index: number): string {
  let current = index + 1;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function requiresXmlSpacePreserve(value: string): boolean {
  return value.trim() !== value || /\r|\n/.test(value);
}

async function writeStreamChunk(stream: fs.WriteStream, chunk: string): Promise<void> {
  if (!stream.write(chunk, "utf8")) {
    await once(stream, "drain");
  }
}

async function pipeFileToWriteStream(sourcePath: string, target: fs.WriteStream): Promise<void> {
  const source = fs.createReadStream(sourcePath);
  source.on("error", (error) => target.destroy(error));
  source.pipe(target, { end: false });
  await once(source, "end");
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function buildContentTypesXml(): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">",
    "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>",
    "<Default Extension=\"xml\" ContentType=\"application/xml\"/>",
    "<Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>",
    "<Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>",
    "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>",
    "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>",
    "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>",
    "</Types>",
  ].join("");
}

function buildRootRelsXml(): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
    "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>",
    "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>",
    "<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties\" Target=\"docProps/app.xml\"/>",
    "</Relationships>",
  ].join("");
}

function buildAppPropsXml(): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">",
    "<Application>Moon For Oracle</Application>",
    "</Properties>",
  ].join("");
}

function buildCorePropsXml(timestamp: string): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">",
    "<dc:creator>Moon For Oracle</dc:creator>",
    "<cp:lastModifiedBy>Moon For Oracle</cp:lastModifiedBy>",
    `<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>`,
    "</cp:coreProperties>",
  ].join("");
}

function buildWorkbookXml(): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">",
    "<sheets>",
    "<sheet name=\"Results\" sheetId=\"1\" r:id=\"rId1\"/>",
    "</sheets>",
    "</workbook>",
  ].join("");
}

function buildWorkbookRelsXml(): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">",
    "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>",
    "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>",
    "</Relationships>",
  ].join("");
}

function buildStylesXml(): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
    "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
    "<numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"yyyy-mm-dd hh:mm:ss\"/></numFmts>",
    "<fonts count=\"1\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>",
    "<fills count=\"1\"><fill><patternFill patternType=\"none\"/></fill></fills>",
    "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>",
    "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>",
    "<cellXfs count=\"2\">",
    "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>",
    "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>",
    "</cellXfs>",
    "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles>",
    "</styleSheet>",
  ].join("");
}
