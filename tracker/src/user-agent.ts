/**
 * Device, browser and operating system as coarse families, parsed on the
 * site's server. The user agent itself never leaves the site.
 *
 * Deliberately a short list of regular expressions and not a parsing
 * library: the panel needs "mobile, Chrome, Android", not versions, and a
 * family that isn't listed is simply `Other`. Order matters: Edge and Opera
 * announce themselves as Chrome too, and every browser on iOS as Safari.
 */

export type Device = 'mobile' | 'tablet' | 'desktop';

export interface UserAgentFamilies {
  device: Device;
  browser: string;
  os: string;
}

const BROWSERS: Array<[RegExp, string]> = [
  // In-app browsers first: they explain why a visit from a social app often
  // arrives without a referrer.
  [/Instagram/, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/, 'Facebook'],
  [/TikTok|musical_ly|BytedanceWebview/, 'TikTok'],
  [/LinkedInApp/, 'LinkedIn'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/Firefox|FxiOS/, 'Firefox'],
  [/Chrome|CriOS|Chromium/, 'Chrome'],
  [/Safari/, 'Safari'],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

export function parseUserAgent(ua: string): UserAgentFamilies {
  return {
    device: deviceOf(ua),
    browser: BROWSERS.find(([re]) => re.test(ua))?.[1] ?? 'Other',
    os: SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? 'Other',
  };
}

function deviceOf(ua: string): Device {
  // Android tablets drop "Mobile" from their user agent; phones keep it.
  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) {
    return 'tablet';
  }
  if (/Mobi|iPhone|iPod|Android|Windows Phone/.test(ua)) return 'mobile';
  return 'desktop';
}
