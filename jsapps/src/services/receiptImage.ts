/**
 * Turning a picked image file into something small enough to store in Postgres.
 *
 * Receipts live in the database (`expense_receipts`, migration 20260725000005),
 * not in a Storage bucket, so the client is responsible for making them small
 * *before* they are sent: a 4 MB phone photo is fine in object storage and
 * absurd in a 500 MB Postgres. Everything here is the downscale-and-encode step;
 * `receiptStore.ts` does the talking to the database.
 *
 * No new dependency — the repo is capped at five runtime deps (see
 * `jsapps/.bolt/prompt`), so this is `<canvas>` and `FileReader`, both built in.
 *
 * The pipeline:
 *   1. reject anything that is not an image up front;
 *   2. decode it and scale the longest edge down to `RECEIPT_MAX_EDGE`;
 *   3. re-encode as JPEG, stepping quality down through `RECEIPT_QUALITY_STEPS`
 *      until the result fits `RECEIPT_MAX_BYTES`;
 *   4. if even the floor quality will not fit, fail with a message a user can
 *      act on. Never silently truncate — the server's CHECK would reject the row
 *      anyway, and a half-image is worse than no image.
 *
 * The browser work sits behind an injectable `ReceiptImageDeps` seam. jsdom has
 * no canvas raster and no image decoder, so the alternative would be either
 * untested stepping logic or a canvas dependency in devDependencies for the sake
 * of one test file.
 */

/** Hard ceiling, matching `expense_receipts.byte_size`'s CHECK (512 KB). */
export const RECEIPT_MAX_BYTES = 524288;

/** Longest edge after downscaling. A receipt is legible well below this. */
export const RECEIPT_MAX_EDGE = 1600;

/** Tried in order; the first result under the ceiling wins. */
export const RECEIPT_QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5] as const;

/**
 * The mime types `expense_receipts.mime_type` accepts. Re-encoding always emits
 * `image/jpeg`; the other two exist because the column outlives this encoder.
 */
export type ReceiptMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

/** A receipt ready to be written: payload plus the two columns describing it. */
export interface EncodedReceipt {
  mimeType: ReceiptMimeType;
  /** Bytes of the *image*, not of the base64 text. */
  byteSize: number;
  /** Base64 WITHOUT a `data:` prefix — the DB stores pure payload. */
  dataBase64: string;
  /** Pixel size actually stored, for an honest "1600 × 1200" in the UI. */
  width: number;
  height: number;
}

export interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
}

export interface ReceiptImageDeps {
  decode: (file: Blob) => Promise<DecodedImage>;
  /** Draw `image` at w×h and encode as JPEG at `quality`. Null if encoding failed. */
  render: (image: DecodedImage, width: number, height: number, quality: number) => Promise<Blob | null>;
  toBase64: (blob: Blob) => Promise<string>;
}

/**
 * Fit `width`×`height` inside a `maxEdge` box, preserving aspect ratio.
 * Images already inside the box are left alone — upscaling a small receipt would
 * add bytes and no detail. At least 1px each way, so a 4000×1 strip stays valid.
 */
export function scaleToFit(
  width: number,
  height: number,
  maxEdge: number = RECEIPT_MAX_EDGE
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** `data:image/jpeg;base64,…` for an `<img src>`. Built at render time, never stored. */
export function receiptDataUrl(mimeType: string, dataBase64: string): string {
  return `data:${mimeType};base64,${dataBase64}`;
}

/** Human-readable byte count for the UI. Deliberately KB/MB, not KiB/MiB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Base64 via `FileReader.readAsDataURL`, then drop the `data:…;base64,` prefix.
 *
 * `Blob.arrayBuffer()` plus manual base64 would be more direct but is not
 * available in jsdom (the same gap `src/test/setup.ts` patches for
 * `Blob.prototype.text`), and `FileReader` is implemented everywhere.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? '' : dataUrl.slice(comma + 1);
}

async function decodeInBrowser(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  }
  // Fallback for browsers without createImageBitmap (older Safari): decode
  // through an <img> and an object URL, which is revoked either way.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn't be read."));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, source: img };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderInBrowser(
  image: DecodedImage,
  width: number,
  height: number,
  quality: number
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // JPEG has no alpha: without a white ground, a transparent PNG's background
  // encodes as black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image.source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

export const browserReceiptImageDeps: ReceiptImageDeps = {
  decode: decodeInBrowser,
  render: renderInBrowser,
  toBase64: blobToBase64,
};

/**
 * Downscale, re-encode and base64 a picked file, or throw an `Error` whose
 * message is already worded for the user (every caller surfaces it verbatim).
 */
export async function prepareReceipt(
  file: File | Blob,
  deps: ReceiptImageDeps = browserReceiptImageDeps
): Promise<EncodedReceipt> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image. Attach a JPEG, PNG or WebP photo.');
  }

  let decoded: DecodedImage;
  try {
    decoded = await deps.decode(file);
  } catch {
    throw new Error("That image couldn't be read. Try a different photo.");
  }
  if (!decoded.width || !decoded.height) {
    throw new Error("That image couldn't be read. Try a different photo.");
  }

  const { width, height } = scaleToFit(decoded.width, decoded.height);

  for (const quality of RECEIPT_QUALITY_STEPS) {
    const blob = await deps.render(decoded, width, height, quality);
    if (!blob) {
      throw new Error("This browser couldn't process that image.");
    }
    if (blob.size <= RECEIPT_MAX_BYTES) {
      return {
        mimeType: 'image/jpeg',
        byteSize: blob.size,
        dataBase64: await deps.toBase64(blob),
        width,
        height,
      };
    }
  }

  throw new Error(
    `That image is still over ${formatBytes(RECEIPT_MAX_BYTES)} at the lowest quality. ` +
      'Crop it, or take a smaller photo.'
  );
}
