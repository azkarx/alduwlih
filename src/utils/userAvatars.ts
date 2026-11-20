import daliaAvatarImg from '../assets/images/dalia_avatar.png';
import mohamedAvatarImg from '../assets/images/mohamed_avatar.png';

export const USER_AVATARS = {
  mohamed: mohamedAvatarImg,
  dalia: daliaAvatarImg,
} as const;

let preloaded = false;

export function preloadUserAvatars(): void {
  if (preloaded || typeof window === 'undefined' || typeof Image === 'undefined') {
    return;
  }
  preloaded = true;
  for (const src of [USER_AVATARS.dalia, USER_AVATARS.mohamed]) {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'sync';
    img.src = src;
    if (typeof img.decode === 'function') {
      void img.decode().catch(() => {
        // Ignore decode rejection if image isn't ready yet
      });
    }
  }
}
