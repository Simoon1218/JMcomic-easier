// Zero-dependency standard ZIP (STORE + CRC32 + UTF-8) builder for browser downloads.
// Comic images (JPG/PNG/WebP) are already compressed, so STORE mode is faster,
// uses less memory, and works offline without any external CDN.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1);
  return { dosDate, dosTime };
}

/**
 * Build a standard .zip Blob from an array of { name: string, data: Uint8Array }.
 */
export function createZipBlob(entries) {
  const encoder = new TextEncoder();
  const { dosDate, dosTime } = getDosDateTime();

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = crc32(data);
    const size = data.byteLength;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed (2.0)
    lv.setUint16(6, 0x0800, true);     // General purpose bit flag (UTF-8)
    lv.setUint16(8, 0, true);          // Compression method: 0 (STORE)
    lv.setUint16(10, dosTime, true);   // Last mod file time
    lv.setUint16(12, dosDate, true);   // Last mod file date
    lv.setUint32(14, crc, true);       // CRC-32
    lv.setUint32(18, size, true);      // Compressed size
    lv.setUint32(22, size, true);      // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true);         // Version made by
    cv.setUint16(6, 20, true);         // Version needed
    cv.setUint16(8, 0x0800, true);     // General purpose bit flag (UTF-8)
    cv.setUint16(10, 0, true);         // Compression method: 0 (STORE)
    cv.setUint16(12, dosTime, true);   // Last mod file time
    cv.setUint16(14, dosDate, true);   // Last mod file date
    cv.setUint32(16, crc, true);       // CRC-32
    cv.setUint32(20, size, true);      // Compressed size
    cv.setUint32(24, size, true);      // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true);         // Extra field length
    cv.setUint16(32, 0, true);         // File comment length
    cv.setUint16(34, 0, true);         // Disk number start
    cv.setUint16(36, 0, true);         // Internal file attributes
    cv.setUint32(38, 0, true);         // External file attributes
    cv.setUint32(42, offset, true);    // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.byteLength + size;
    centralSize += centralHeader.byteLength;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);         // EOCD signature
  ev.setUint16(4, 0, true);                  // Number of this disk
  ev.setUint16(6, 0, true);                  // Disk where CD starts
  ev.setUint16(8, entries.length, true);     // Entries on this disk
  ev.setUint16(10, entries.length, true);    // Total entries
  ev.setUint32(12, centralSize, true);       // Size of central directory
  ev.setUint32(16, offset, true);            // Offset of start of CD
  ev.setUint16(20, 0, true);                 // Comment length

  return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}
