import fs from "node:fs";
import { once } from "node:events";
import path from "node:path";

interface ZipEntryInput {
  name: string;
  sourcePath: string;
}

interface ZipEntryMeta {
  name: string;
  sourcePath: string;
  crc32: number;
  size: number;
  offset: number;
  dosTime: number;
  dosDate: number;
}

const CRC_TABLE = buildCrc32Table();

export async function writeStoredZip(entries: ZipEntryInput[], outputPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const metas: ZipEntryMeta[] = [];
  const stream = fs.createWriteStream(outputPath);
  let offset = 0;

  try {
    for (const entry of entries) {
      const stat = await fs.promises.stat(entry.sourcePath);
      const { crc32, size } = await getFileCrc32(entry.sourcePath);
      const { dosTime, dosDate } = toDosDateTime(stat.mtime);
      const nameBuffer = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
      const localHeader = buildLocalFileHeader(nameBuffer, crc32, size, dosTime, dosDate);

      await writeBuffer(stream, localHeader);
      await pipeFileToStream(entry.sourcePath, stream);

      metas.push({
        name: entry.name.replace(/\\/g, "/"),
        sourcePath: entry.sourcePath,
        crc32,
        size,
        offset,
        dosTime,
        dosDate,
      });

      offset += localHeader.length + size;
    }

    const centralDirectoryOffset = offset;
    let centralDirectorySize = 0;
    for (const meta of metas) {
      const nameBuffer = Buffer.from(meta.name, "utf8");
      const centralHeader = buildCentralDirectoryHeader(nameBuffer, meta);
      await writeBuffer(stream, centralHeader);
      centralDirectorySize += centralHeader.length;
      offset += centralHeader.length;
    }

    const endOfCentralDirectory = buildEndOfCentralDirectoryRecord(
      metas.length,
      centralDirectorySize,
      centralDirectoryOffset,
    );
    await writeBuffer(stream, endOfCentralDirectory);
  } finally {
    stream.end();
    await once(stream, "close");
  }
}

function buildLocalFileHeader(
  nameBuffer: Buffer,
  crc32: number,
  size: number,
  dosTime: number,
  dosDate: number,
): Buffer {
  const header = Buffer.alloc(30 + nameBuffer.length);
  let offset = 0;
  offset = writeUInt32LE(header, 0x04034b50, offset);
  offset = writeUInt16LE(header, 20, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, dosTime, offset);
  offset = writeUInt16LE(header, dosDate, offset);
  offset = writeUInt32LE(header, crc32 >>> 0, offset);
  offset = writeUInt32LE(header, size, offset);
  offset = writeUInt32LE(header, size, offset);
  offset = writeUInt16LE(header, nameBuffer.length, offset);
  offset = writeUInt16LE(header, 0, offset);
  nameBuffer.copy(header, offset);
  return header;
}

function buildCentralDirectoryHeader(nameBuffer: Buffer, meta: ZipEntryMeta): Buffer {
  const header = Buffer.alloc(46 + nameBuffer.length);
  let offset = 0;
  offset = writeUInt32LE(header, 0x02014b50, offset);
  offset = writeUInt16LE(header, 20, offset);
  offset = writeUInt16LE(header, 20, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, meta.dosTime, offset);
  offset = writeUInt16LE(header, meta.dosDate, offset);
  offset = writeUInt32LE(header, meta.crc32 >>> 0, offset);
  offset = writeUInt32LE(header, meta.size, offset);
  offset = writeUInt32LE(header, meta.size, offset);
  offset = writeUInt16LE(header, nameBuffer.length, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt16LE(header, 0, offset);
  offset = writeUInt32LE(header, 0, offset);
  offset = writeUInt32LE(header, meta.offset, offset);
  nameBuffer.copy(header, offset);
  return header;
}

function buildEndOfCentralDirectoryRecord(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Buffer {
  const record = Buffer.alloc(22);
  let offset = 0;
  offset = writeUInt32LE(record, 0x06054b50, offset);
  offset = writeUInt16LE(record, 0, offset);
  offset = writeUInt16LE(record, 0, offset);
  offset = writeUInt16LE(record, entryCount, offset);
  offset = writeUInt16LE(record, entryCount, offset);
  offset = writeUInt32LE(record, centralDirectorySize, offset);
  offset = writeUInt32LE(record, centralDirectoryOffset, offset);
  writeUInt16LE(record, 0, offset);
  return record;
}

async function getFileCrc32(filePath: string): Promise<{ crc32: number; size: number }> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    let crc32 = 0 ^ -1;
    let size = 0;

    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      for (let index = 0; index < chunk.length; index += 1) {
        crc32 = (crc32 >>> 8) ^ CRC_TABLE[(crc32 ^ chunk[index]) & 0xff];
      }
    });
    stream.on("error", reject);
    stream.on("end", () => resolve({ crc32: (crc32 ^ -1) >>> 0, size }));
  });
}

async function pipeFileToStream(filePath: string, output: fs.WriteStream): Promise<void> {
  const input = fs.createReadStream(filePath);
  input.on("error", (error) => output.destroy(error));
  input.pipe(output, { end: false });
  await once(input, "end");
}

async function writeBuffer(stream: fs.WriteStream, buffer: Buffer): Promise<void> {
  if (!stream.write(buffer)) {
    await once(stream, "drain");
  }
}

function writeUInt16LE(buffer: Buffer, value: number, offset: number): number {
  buffer.writeUInt16LE(value & 0xffff, offset);
  return offset + 2;
}

function writeUInt32LE(buffer: Buffer, value: number, offset: number): number {
  buffer.writeUInt32LE(value >>> 0, offset);
  return offset + 4;
}

function toDosDateTime(date: Date): { dosDate: number; dosTime: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}
