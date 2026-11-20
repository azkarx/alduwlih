import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMovementPhotoError,
  getMovementPhotoExtension,
  MAX_MOVEMENT_PHOTO_SIZE_BYTES,
} from './movementPhoto';

test('accepts supported image types within the configured size limit', () => {
  for (const [type, extension] of [
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ]) {
    assert.equal(getMovementPhotoError({ type, size: MAX_MOVEMENT_PHOTO_SIZE_BYTES }), undefined);
    assert.equal(getMovementPhotoExtension(type), extension);
  }
});

test('rejects unsupported image types and files larger than 8 MB', () => {
  assert.match(getMovementPhotoError({ type: 'image/gif', size: 12 }) || '', /JPG أو PNG أو WebP/);
  assert.match(
    getMovementPhotoError({ type: 'image/jpeg', size: MAX_MOVEMENT_PHOTO_SIZE_BYTES + 1 }) || '',
    /8 ميجابايت/
  );
});
