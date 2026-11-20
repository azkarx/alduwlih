export const MAX_MOVEMENT_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;

const MOVEMENT_PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function getMovementPhotoError(file: Pick<Blob, 'type' | 'size'>): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(MOVEMENT_PHOTO_EXTENSIONS, file.type)) {
    return 'اختر صورة بصيغة JPG أو PNG أو WebP.';
  }
  if (file.size > MAX_MOVEMENT_PHOTO_SIZE_BYTES) {
    return 'حجم الصورة يتجاوز 8 ميجابايت.';
  }
  return undefined;
}

export function getMovementPhotoExtension(mimeType: string): string | undefined {
  return MOVEMENT_PHOTO_EXTENSIONS[mimeType];
}
