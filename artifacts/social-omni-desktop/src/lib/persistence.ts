export const isDesktop = Boolean(window.socialOmni?.isDesktop);

export async function readLocal(key: string): Promise<string | null> {
  return window.socialOmni ? window.socialOmni.getItem(key) : localStorage.getItem(key);
}
export async function writeLocal(key: string, value: string): Promise<void> {
  if (window.socialOmni) await window.socialOmni.setItem(key, value);
  else localStorage.setItem(key, value);
}
export async function openOfficialPlatform(platform: string): Promise<void> {
  const key = platform.toLowerCase();
  const sites: Record<string, string> = {
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    tiktok: 'https://www.tiktok.com/upload',
    whatsapp: 'https://web.whatsapp.com/',
  };
  if (!Object.hasOwn(sites, key)) throw new Error('This platform is not supported.');
  if (window.socialOmni) await window.socialOmni.openPlatform(key);
  else window.open(sites[key], '_blank', 'noopener,noreferrer');
}
