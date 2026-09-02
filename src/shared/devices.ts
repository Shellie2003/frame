/** Catalogue d'appareils utilisé par le renderer et par les tests. */

export type DeviceCategory = 'phone' | 'tablet' | 'laptop' | 'desktop';
export type Platform = 'ios' | 'android' | 'macos' | 'windows' | 'linux';

export interface Device {
  /** Identifiant stable (utilisé pour la persistance de la sélection). */
  id: string;
  name: string;
  category: DeviceCategory;
  platform: Platform;
  /** Largeur CSS en points, en orientation portrait pour les mobiles. */
  width: number;
  /** Hauteur CSS en points, en orientation portrait pour les mobiles. */
  height: number;
  /** devicePixelRatio simulé. */
  dpr: number;
  /** Émulation tactile (pointer: coarse, événements touch). */
  touch: boolean;
  userAgent: string;
}

const UA_IOS_18 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_IPADOS_18 =
  'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const UA_ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const UA_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const UA_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const DEVICES: readonly Device[] = [
  // --- Téléphones iOS ---
  { id: 'iphone-se',        name: 'iPhone SE (2022)',  category: 'phone',  platform: 'ios',     width: 375,  height: 667,  dpr: 2, touch: true,  userAgent: UA_IOS_18 },
  { id: 'iphone-13-mini',   name: 'iPhone 13 mini',    category: 'phone',  platform: 'ios',     width: 375,  height: 812,  dpr: 3, touch: true,  userAgent: UA_IOS_18 },
  { id: 'iphone-15',        name: 'iPhone 15',         category: 'phone',  platform: 'ios',     width: 393,  height: 852,  dpr: 3, touch: true,  userAgent: UA_IOS_18 },
  { id: 'iphone-15-pro-max',name: 'iPhone 15 Pro Max', category: 'phone',  platform: 'ios',     width: 430,  height: 932,  dpr: 3, touch: true,  userAgent: UA_IOS_18 },
  // --- Téléphones Android ---
  { id: 'galaxy-s8',        name: 'Galaxy S8',         category: 'phone',  platform: 'android', width: 360,  height: 740,  dpr: 4, touch: true,  userAgent: UA_ANDROID_PHONE },
  { id: 'pixel-8',          name: 'Pixel 8',           category: 'phone',  platform: 'android', width: 412,  height: 915,  dpr: 2.625, touch: true, userAgent: UA_ANDROID_PHONE },
  { id: 'galaxy-s24-ultra', name: 'Galaxy S24 Ultra',  category: 'phone',  platform: 'android', width: 384,  height: 824,  dpr: 3.5, touch: true, userAgent: UA_ANDROID_PHONE },
  // --- Tablettes ---
  { id: 'ipad-mini',        name: 'iPad mini',         category: 'tablet', platform: 'ios',     width: 768,  height: 1024, dpr: 2, touch: true,  userAgent: UA_IPADOS_18 },
  { id: 'ipad-pro-11',      name: 'iPad Pro 11"',      category: 'tablet', platform: 'ios',     width: 834,  height: 1194, dpr: 2, touch: true,  userAgent: UA_IPADOS_18 },
  { id: 'galaxy-tab-s9',    name: 'Galaxy Tab S9',     category: 'tablet', platform: 'android', width: 800,  height: 1280, dpr: 2, touch: true,  userAgent: UA_ANDROID_TABLET },
  // --- Portables / bureau ---
  { id: 'macbook-air-13',   name: 'MacBook Air 13"',   category: 'laptop', platform: 'macos',   width: 1280, height: 800,  dpr: 2, touch: false, userAgent: UA_MAC },
  { id: 'macbook-pro-16',   name: 'MacBook Pro 16"',   category: 'laptop', platform: 'macos',   width: 1728, height: 1117, dpr: 2, touch: false, userAgent: UA_MAC },
  { id: 'laptop-hd',        name: 'Portable 1366×768', category: 'laptop', platform: 'windows', width: 1366, height: 768,  dpr: 1, touch: false, userAgent: UA_WINDOWS },
  { id: 'desktop-1080p',    name: 'Bureau 1920×1080',  category: 'desktop',platform: 'windows', width: 1920, height: 1080, dpr: 1, touch: false, userAgent: UA_WINDOWS },
  { id: 'desktop-1440p',    name: 'Bureau 2560×1440',  category: 'desktop',platform: 'windows', width: 2560, height: 1440, dpr: 1, touch: false, userAgent: UA_WINDOWS },
];

/** Sélection affichée au premier lancement : un mobile, une tablette, un desktop. */
export const DEFAULT_SELECTION: readonly string[] = ['iphone-15', 'pixel-8', 'ipad-mini', 'desktop-1080p'];

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  phone: 'Téléphones',
  tablet: 'Tablettes',
  laptop: 'Portables',
  desktop: 'Bureau',
};

export function findDevice(id: string): Device | undefined {
  return DEVICES.find((d) => d.id === id);
}

export function devicesByCategory(): Array<[DeviceCategory, Device[]]> {
  const order: DeviceCategory[] = ['phone', 'tablet', 'laptop', 'desktop'];
  return order.map((cat) => [cat, DEVICES.filter((d) => d.category === cat)]);
}

/**
 * Normalise une saisie utilisateur en URL chargeable.
 * Une saisie qui ressemble à un domaine ou à une adresse locale devient une URL http(s),
 * tout le reste part en recherche web.
 */
export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (value === '') return 'about:blank';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^(about|data|file):/i.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/i.test(value) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(value)) {
    return `http://${value}`;
  }
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?(\/|$|\?|#)/i.test(value)) return `https://${value}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

/** Dimensions effectives une fois l'orientation appliquée. */
export function orientedSize(device: Device, landscape: boolean): { width: number; height: number } {
  const rotatable = device.category === 'phone' || device.category === 'tablet';
  if (landscape && rotatable) return { width: device.height, height: device.width };
  return { width: device.width, height: device.height };
}
