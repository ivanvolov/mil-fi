/**
 * Client-side image shrink for engagement submissions. The API accepts JSON
 * bodies up to Fastify's 1 MB default, and two full-resolution photos as base64
 * blow straight past that — so both images are downscaled/re-encoded before the
 * POST. Also makes arbitrary phone-camera uploads (3-8 MB) just work.
 */

const MAX_DIM = 1280;
/** Combined base64 budget for BOTH images, leaving JSON envelope headroom. */
const BUDGET_CHARS = 900_000;

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to decode image'));
    img.src = src;
  });
}

function encode(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Re-encode a single image (data URL or same-origin URL) to a bounded JPEG data URL. */
export async function shrinkImage(src: string, maxDim = MAX_DIM, quality = 0.8): Promise<string> {
  const img = await loadImage(src);
  return encode(img, maxDim, quality);
}

/** Shrink the report/post pair, stepping quality+size down until the combined
 *  payload fits the API's body limit. */
export async function shrinkImagePair(srcA: string, srcB: string): Promise<[string, string]> {
  const [imgA, imgB] = await Promise.all([loadImage(srcA), loadImage(srcB)]);
  const steps: Array<[number, number]> = [
    [MAX_DIM, 0.8],
    [1024, 0.7],
    [800, 0.6],
    [640, 0.5],
  ];
  let pair: [string, string] = [encode(imgA, MAX_DIM, 0.8), encode(imgB, MAX_DIM, 0.8)];
  for (const [dim, q] of steps) {
    pair = [encode(imgA, dim, q), encode(imgB, dim, q)];
    if (pair[0].length + pair[1].length <= BUDGET_CHARS) break;
  }
  return pair;
}
