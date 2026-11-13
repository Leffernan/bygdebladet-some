declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development';

export function shouldNotifyAboutVersion(current: string, latest: unknown) {
  return typeof latest === 'string' && latest.trim() !== '' &&
    current !== '' && current !== 'development' && latest !== 'development' && current !== latest;
}
