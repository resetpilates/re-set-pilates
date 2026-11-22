// The optional photo on the membership card. The phone shrinks whatever was picked (a camera shot can be 10 MB)
// to a small square JPEG before it is kept on the device and sent to the studio's records.

export const PHOTO_PX = 480; // square side: sharp on the card and in Airtable, about 60 KB

/** Centre square of an image w × h: [left, top, side]. */
export function squareCrop(w: number, h: number): [number, number, number] {
  const side = Math.min(w, h);
  return [Math.round((w - side) / 2), Math.round((h - side) / 2), side];
}

/** The base64 part of a data URL (what the relay takes). */
export const photoBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  if ("createImageBitmap" in window) {
    try {
      // from-image: a portrait phone photo comes out upright
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      /* fall through to <img>, which reads a few more formats */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

/** A picked image file → square JPEG data URL. Rejects when the file is not an image the browser can read. */
export async function photoFromFile(file: Blob): Promise<string> {
  const { src, w, h, done } = await decode(file);
  try {
    if (!w || !h) throw new Error("empty image");
    const [x, y, side] = squareCrop(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_PX;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // a transparent PNG gets a white background, not black
    ctx.fillRect(0, 0, PHOTO_PX, PHOTO_PX);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, x, y, side, side, 0, 0, PHOTO_PX, PHOTO_PX);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    done();
  }
}
