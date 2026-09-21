export const MAX_PRODUCT_IMAGES = 20;
export const MAX_IMAGE_FILE_SIZE_BYTES = 1024 * 1024;

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface UploadableImage {
  name: string;
  size: number;
  type: string;
}

export interface RejectedImage {
  file: UploadableImage;
  reason: string;
}

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateImageUploadBatch<T extends UploadableImage>(
  files: T[],
  currentImageCount = 0,
): { validFiles: T[]; rejectedFiles: Array<RejectedImage & { file: T }> } {
  const validFiles: T[] = [];
  const rejectedFiles: Array<RejectedImage & { file: T }> = [];
  const availableSlots = Math.max(0, MAX_PRODUCT_IMAGES - currentImageCount);

  for (const file of files) {
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      rejectedFiles.push({ file, reason: "Cada imagen puede pesar como máximo 1 MB" });
      continue;
    }
    if (
      !SUPPORTED_IMAGE_EXTENSIONS.has(extensionOf(file.name)) ||
      (file.type && !SUPPORTED_IMAGE_TYPES.has(file.type))
    ) {
      rejectedFiles.push({ file, reason: "Formato no soportado. Usá JPG, PNG o WebP" });
      continue;
    }
    if (validFiles.length >= availableSlots) {
      rejectedFiles.push({ file, reason: "El producto admite un máximo de 20 imágenes" });
      continue;
    }
    validFiles.push(file);
  }

  return { validFiles, rejectedFiles };
}
