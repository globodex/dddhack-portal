// Browser-only preparation. The server independently validates the encoded image.
import {
  projectMediaPolicy, PROJECT_MEDIA_SOURCE_MIN_DIMENSION, PROJECT_MEDIA_MAX_DIMENSION,
  PROJECT_MEDIA_JPEG_QUALITIES, PROJECT_MEDIA_MAX_OPTIMIZATION_STEPS, PROJECT_MEDIA_RESIZE_FACTOR,
  type ProjectMediaKind,
} from "../lib/project-media-policy";
import { inspectProjectImageBytes } from "../lib/project-image-preflight";
export type ProjectImageKind = ProjectMediaKind;

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That image could not be read. Try another PNG or JPEG."));
    reader.readAsDataURL(blob);
  });
}
function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("That image could not be prepared. Try another PNG or JPEG.")), type, quality));
}

export async function prepareProjectImage(file: File, kind: ProjectImageKind) {
  const policy = projectMediaPolicy[kind];
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG or JPEG image.");
  if (file.size > policy.sourceMaxBytes) throw new Error(`Choose a ${kind} of ${kind === "logo" ? "1" : "5"} MB or smaller.`);
  if (!file.size) throw new Error("That image is empty. Choose another PNG or JPEG.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    inspectProjectImageBytes(bytes, file.type, kind, "source");
  } catch (cause) {
    const code = (cause as { code?: string }).code;
    if (code === "IMAGE_DIMENSIONS") throw new Error("Use an image between 64 and 4096 pixels on each side.");
    throw new Error("That file is not a readable PNG or JPEG. Choose another image.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const source = new Image();
    source.src = objectUrl;
    try { await source.decode(); }
    catch { throw new Error("That file is not a readable PNG or JPEG. Choose another image."); }
    const sourceWidth = source.naturalWidth, sourceHeight = source.naturalHeight;
    if (Math.min(sourceWidth, sourceHeight) < PROJECT_MEDIA_SOURCE_MIN_DIMENSION || Math.max(sourceWidth, sourceHeight) > PROJECT_MEDIA_MAX_DIMENSION)
      throw new Error("Use an image between 64 and 4096 pixels on each side.");
    if (file.size <= policy.canonicalMaxBytes && Math.max(sourceWidth, sourceHeight) <= policy.optimizationMaxEdge) return { dataUrl: await blobDataUrl(file), sourceWidth, sourceHeight };
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the image. Try another browser.");
    let scale = Math.min(1, policy.optimizationMaxEdge / Math.max(sourceWidth, sourceHeight));
    // PNG always remains PNG to retain alpha; JPEG stays JPEG. Both keep the full image.
    for (let attempt = 0; attempt < PROJECT_MEDIA_MAX_OPTIMIZATION_STEPS; attempt++) {
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of file.type === "image/png" ? [1] : PROJECT_MEDIA_JPEG_QUALITIES) {
        const blob = await canvasBlob(canvas, file.type, quality);
        if (blob.size <= policy.canonicalMaxBytes) return { dataUrl: await blobDataUrl(blob), sourceWidth, sourceHeight };
      }
      scale *= PROJECT_MEDIA_RESIZE_FACTOR;
    }
    throw new Error("That image could not be prepared. Try another PNG or JPEG.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
