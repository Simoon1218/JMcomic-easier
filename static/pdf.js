// Zero-dependency standard PDF 1.4 builder for comic image blobs.
// Directly embeds JPEG streams (/DCTDecode) and converts PNG/WebP via canvas.

const encoder = new TextEncoder();

function encodeAscii(str) {
  return encoder.encode(str);
}

async function decodeImageDimensions(blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dims = { width: bitmap.width, height: bitmap.height, bitmap };
    return dims;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, img });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

async function blobToJpegEntry(blob) {
  const rawBytes = new Uint8Array(await blob.arrayBuffer());
  const isJpeg =
    rawBytes.length >= 3 &&
    rawBytes[0] === 0xff &&
    rawBytes[1] === 0xd8 &&
    rawBytes[2] === 0xff;

  const decoded = await decodeImageDimensions(blob);
  const { width, height } = decoded;

  if (isJpeg) {
    if (decoded.bitmap?.close) decoded.bitmap.close();
    return { width, height, jpegBytes: rawBytes };
  }

  // Convert PNG/WebP/GIF to baseline JPEG via canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(decoded.bitmap || decoded.img, 0, 0, width, height);
  if (decoded.bitmap?.close) decoded.bitmap.close();

  const jpegBlob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas JPEG 转换失败"))),
      "image/jpeg",
      0.92
    );
  });
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  return { width, height, jpegBytes };
}

/**
 * Create a multi-page PDF Blob from an array of image Blobs.
 * @param {Blob[]} blobs
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function createPdfBlob(blobs, onProgress) {
  const images = [];
  for (let i = 0; i < blobs.length; i++) {
    const entry = await blobToJpegEntry(blobs[i]);
    images.push(entry);
    if (onProgress) onProgress(i + 1, blobs.length);
  }

  // Object IDs:
  // 1: Catalog
  // 2: Pages
  // For each page i (0..N-1):
  //   pageObjId    = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId   = 5 + i * 3
  const pageCount = images.length;
  const totalObjects = 2 + pageCount * 3;
  const parts = [];
  const offsets = new Array(totalObjects + 1).fill(0);
  let byteOffset = 0;

  const pushChunk = (chunk) => {
    const u8 = typeof chunk === "string" ? encodeAscii(chunk) : chunk;
    parts.push(u8);
    byteOffset += u8.byteLength;
  };

  pushChunk("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  // 1: Catalog
  offsets[1] = byteOffset;
  pushChunk("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2: Pages
  const kidsRefs = [];
  for (let i = 0; i < pageCount; i++) {
    kidsRefs.push(`${3 + i * 3} 0 R`);
  }
  offsets[2] = byteOffset;
  pushChunk(`2 0 obj\n<< /Type /Pages /Kids [${kidsRefs.join(" ")}] /Count ${pageCount} >>\nendobj\n`);

  // Pages, Contents, Images
  for (let i = 0; i < pageCount; i++) {
    const { width, height, jpegBytes } = images[i];
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;

    // Normalize page width to A4 width (595.28pt) while keeping exact aspect ratio
    const pdfW = 595.28;
    const pdfH = Number(((pdfW * height) / Math.max(1, width)).toFixed(2));
    const drawCmd = `q\n${pdfW.toFixed(2)} 0 0 ${pdfH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    const drawBytes = encodeAscii(drawCmd);

    offsets[pageObjId] = byteOffset;
    pushChunk(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfW.toFixed(2)} ${pdfH.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    offsets[contentObjId] = byteOffset;
    pushChunk(`${contentObjId} 0 obj\n<< /Length ${drawBytes.byteLength} >>\nstream\n`);
    pushChunk(drawBytes);
    pushChunk("\nendstream\nendobj\n");

    offsets[imageObjId] = byteOffset;
    pushChunk(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
    );
    pushChunk(jpegBytes);
    pushChunk("\nendstream\nendobj\n");
  }

  // XRef table
  const xrefOffset = byteOffset;
  pushChunk(`xref\n0 ${totalObjects + 1}\n`);
  pushChunk("0000000000 65535 f \n");
  for (let id = 1; id <= totalObjects; id++) {
    pushChunk(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }

  pushChunk(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(parts, { type: "application/pdf" });
}
