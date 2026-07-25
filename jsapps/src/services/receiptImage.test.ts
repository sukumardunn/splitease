/**
 * Receipts are stored in Postgres, so "make it small enough" is not a nicety —
 * it is what keeps a 4 MB phone photo out of a 500 MB database, and the server's
 * `byte_size` CHECK rejects anything that slips through. These tests pin the
 * quality-stepping loop, the geometry, and every path that must refuse rather
 * than store something broken.
 *
 * The browser work (image decoding, canvas rasterisation, `toBlob`) is injected:
 * jsdom implements none of it, and the alternative would be adding a native
 * `canvas` dependency for one test file.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_EDGE,
  RECEIPT_QUALITY_STEPS,
  blobToBase64,
  formatBytes,
  prepareReceipt,
  receiptDataUrl,
  scaleToFit,
  type ReceiptImageDeps,
} from './receiptImage';

/** A fake image file — only `type` matters before `decode` is called. */
function imageFile(type = 'image/jpeg'): File {
  return new File(['not really an image'], 'receipt.jpg', { type });
}

/**
 * Deps whose encoder produces a blob of `sizeFor(quality)` bytes, so a test can
 * describe a photo purely by how it responds to compression.
 */
function fakeDeps(
  sizeFor: (quality: number) => number,
  over: Partial<ReceiptImageDeps> = {}
): ReceiptImageDeps & { renders: { width: number; height: number; quality: number }[] } {
  const renders: { width: number; height: number; quality: number }[] = [];
  return {
    renders,
    decode: () => Promise.resolve({ width: 3000, height: 2000, source: {} as CanvasImageSource }),
    render: (_image, width, height, quality) => {
      renders.push({ width, height, quality });
      return Promise.resolve(new Blob([new Uint8Array(sizeFor(quality))], { type: 'image/jpeg' }));
    },
    toBase64: () => Promise.resolve('QUJD'),
    ...over,
  };
}

describe('scaleToFit', () => {
  it('shrinks the longest edge to the cap and keeps the aspect ratio', () => {
    expect(scaleToFit(3000, 2000)).toEqual({ width: RECEIPT_MAX_EDGE, height: 1067 });
    expect(scaleToFit(2000, 3000)).toEqual({ width: 1067, height: RECEIPT_MAX_EDGE });
  });

  it('leaves an image already inside the box alone', () => {
    // Upscaling would add bytes and no detail.
    expect(scaleToFit(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaleToFit(RECEIPT_MAX_EDGE, 100)).toEqual({ width: RECEIPT_MAX_EDGE, height: 100 });
  });

  it('never rounds a thin edge down to zero', () => {
    // A 4000x1 strip would otherwise become 1600x0, which no canvas accepts.
    expect(scaleToFit(4000, 1)).toEqual({ width: RECEIPT_MAX_EDGE, height: 1 });
  });
});

describe('formatBytes', () => {
  it('reads in units a person expects', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(RECEIPT_MAX_BYTES)).toBe('512 KB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });
});

describe('receiptDataUrl', () => {
  it('builds the data URI at render time from the stored parts', () => {
    // The DB column holds pure base64 — the prefix is never stored, so that a
    // mime-type change cannot leave a stale prefix behind.
    expect(receiptDataUrl('image/jpeg', 'QUJD')).toBe('data:image/jpeg;base64,QUJD');
  });
});

describe('blobToBase64', () => {
  it('strips the data-URL prefix and returns payload only', async () => {
    const base64 = await blobToBase64(new Blob(['ABC'], { type: 'text/plain' }));
    expect(base64).toBe('QUJD');
    expect(base64).not.toContain('base64,');
  });
});

describe('prepareReceipt', () => {
  it('accepts the first quality that fits and stops there', async () => {
    const deps = fakeDeps(() => 1000);
    const encoded = await prepareReceipt(imageFile(), deps);

    expect(encoded).toEqual({
      mimeType: 'image/jpeg',
      byteSize: 1000,
      dataBase64: 'QUJD',
      width: RECEIPT_MAX_EDGE,
      height: 1067,
    });
    // One render only: no reason to try harder once it fits.
    expect(deps.renders.map((r) => r.quality)).toEqual([RECEIPT_QUALITY_STEPS[0]]);
  });

  it('steps quality down until the result is under the ceiling', async () => {
    // Only the third step gets under 512 KB.
    const deps = fakeDeps((q) => (q > 0.6 ? RECEIPT_MAX_BYTES + 1 : RECEIPT_MAX_BYTES - 1));
    const encoded = await prepareReceipt(imageFile(), deps);

    expect(encoded.byteSize).toBe(RECEIPT_MAX_BYTES - 1);
    expect(deps.renders.map((r) => r.quality)).toEqual([0.82, 0.7, 0.6]);
  });

  it('accepts a result exactly on the limit', async () => {
    // The DB CHECK is `<= 524288`, so the client must not be stricter than it.
    const deps = fakeDeps(() => RECEIPT_MAX_BYTES);
    await expect(prepareReceipt(imageFile(), deps)).resolves.toMatchObject({
      byteSize: RECEIPT_MAX_BYTES,
    });
  });

  it('rejects, rather than truncating, when even the floor quality is too big', async () => {
    const deps = fakeDeps(() => RECEIPT_MAX_BYTES + 1);
    await expect(prepareReceipt(imageFile(), deps)).rejects.toThrow(/512 KB at the lowest quality/);
    // Every step was genuinely tried before giving up.
    expect(deps.renders).toHaveLength(RECEIPT_QUALITY_STEPS.length);
  });

  it('always downscales to the cap before encoding', async () => {
    const deps = fakeDeps(() => 10);
    await prepareReceipt(imageFile(), deps);
    expect(deps.renders[0]).toMatchObject({ width: RECEIPT_MAX_EDGE, height: 1067 });
  });

  it('refuses a file that is not an image, without decoding it', async () => {
    const deps = fakeDeps(() => 10);
    const decode = vi.spyOn(deps, 'decode');
    await expect(prepareReceipt(new File(['x'], 'notes.pdf', { type: 'application/pdf' }), deps))
      .rejects.toThrow(/not an image/);
    expect(decode).not.toHaveBeenCalled();
  });

  it('turns a decode failure into a message a user can act on', async () => {
    const deps = fakeDeps(() => 10, { decode: () => Promise.reject(new Error('boom')) });
    await expect(prepareReceipt(imageFile(), deps)).rejects.toThrow(/couldn't be read/);
  });

  it('treats a zero-dimension decode as unreadable', async () => {
    // A truncated file can decode "successfully" with no pixels; drawing that
    // produces a 0x0 canvas, which encodes to a blob that is not an image.
    const deps = fakeDeps(() => 10, {
      decode: () => Promise.resolve({ width: 0, height: 0, source: {} as CanvasImageSource }),
    });
    await expect(prepareReceipt(imageFile(), deps)).rejects.toThrow(/couldn't be read/);
  });

  it('reports a canvas that refuses to encode instead of storing nothing', async () => {
    const deps = fakeDeps(() => 10, { render: () => Promise.resolve(null) });
    await expect(prepareReceipt(imageFile(), deps)).rejects.toThrow(/couldn't process/);
  });
});
