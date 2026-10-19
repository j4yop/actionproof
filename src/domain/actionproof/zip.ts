/**
 * Minimal, dependency-free ZIP support for ActionProof bundles.
 *
 * Bundles are written with *stored* (uncompressed) entries so the archive is
 * byte-deterministic and can be read back without an inflate implementation.
 * Reading rejects compressed entries explicitly instead of guessing.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

/** Builds a deterministic ZIP archive containing only stored (uncompressed) entries. */
export function buildStoredZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const checksum = crc32(entry.data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // method: stored
    localView.setUint16(10, 0, true); // mod time (fixed for determinism)
    localView.setUint16(12, 0x21, true); // mod date: 1980-01-01
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true); // flags
    centralView.setUint16(10, 0, true); // method: stored
    centralView.setUint16(12, 0, true); // mod time
    centralView.setUint16(14, 0x21, true); // mod date
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra length
    centralView.setUint16(32, 0, true); // comment length
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    chunks.push(localHeader, entry.data);
    central.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  endView.setUint16(4, 0, true); // disk number
  endView.setUint16(6, 0, true); // disk with central directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true); // comment length

  const totalSize = offset + centralSize + end.length;
  const archive = new Uint8Array(totalSize);
  let position = 0;
  for (const chunk of [...chunks, ...central, end]) {
    archive.set(chunk, position);
    position += chunk.length;
  }
  return archive;
}

/** Reads a ZIP archive that contains only stored (uncompressed) entries. */
export function readStoredZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 22) {
    throw new ZipError("The archive is too small to be a ZIP file.");
  }

  let endOffset = -1;
  for (let index = bytes.byteLength - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) {
    throw new ZipError("No ZIP end-of-central-directory record was found.");
  }

  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (centralOffset + centralSize > bytes.byteLength) {
    throw new ZipError("The ZIP central directory points outside the archive.");
  }

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let position = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(position, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipError("The ZIP central directory is malformed.");
    }
    const method = view.getUint16(position + 10, true);
    const compressedSize = view.getUint32(position + 20, true);
    const uncompressedSize = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const localOffset = view.getUint32(position + 42, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));

    if (method !== 0) {
      throw new ZipError(`Entry "${name}" is compressed. ActionProof bundles are stored uncompressed; re-export the bundle instead.`);
    }
    if (compressedSize !== uncompressedSize) {
      throw new ZipError(`Entry "${name}" has inconsistent sizes.`);
    }

    if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new ZipError(`Entry "${name}" has a malformed local header.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + uncompressedSize);
    if (data.length !== uncompressedSize) {
      throw new ZipError(`Entry "${name}" is truncated.`);
    }

    entries.push({ name, data: new Uint8Array(data) });
    position += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
