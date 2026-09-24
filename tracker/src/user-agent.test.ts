import { parseUserAgent } from './user-agent';

const UA = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 OPR/110.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 15633.69.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0',
  facebook: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 [FBAN/EMA;FBAV/400.0]',
  tiktok: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 musical_ly_2023',
  linkedin: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]',
};

describe('parseUserAgent', () => {
  it.each([
    [UA.chromeWindows, 'desktop', 'Chrome', 'Windows'],
    [UA.edge, 'desktop', 'Edge', 'Windows'],
    [UA.safariMac, 'desktop', 'Safari', 'macOS'],
    [UA.iphone, 'mobile', 'Safari', 'iOS'],
    [UA.chromeIos, 'mobile', 'Chrome', 'iOS'],
    [UA.ipad, 'tablet', 'Safari', 'iOS'],
    [UA.androidPhone, 'mobile', 'Chrome', 'Android'],
    [UA.androidTablet, 'tablet', 'Chrome', 'Android'],
    [UA.samsung, 'mobile', 'Samsung Internet', 'Android'],
    [UA.firefoxLinux, 'desktop', 'Firefox', 'Linux'],
    [UA.opera, 'desktop', 'Opera', 'Windows'],
    [UA.chromebook, 'desktop', 'Chrome', 'ChromeOS'],
    [UA.instagram, 'mobile', 'Instagram', 'iOS'],
    [UA.facebook, 'mobile', 'Facebook', 'Android'],
    [UA.tiktok, 'mobile', 'TikTok', 'Android'],
    [UA.linkedin, 'mobile', 'LinkedIn', 'iOS'],
  ])('%s', (ua, device, browser, os) => {
    expect(parseUserAgent(ua)).toEqual({ device, browser, os });
  });

  it('calls what it does not know Other', () => {
    expect(parseUserAgent('SomethingNew/1.0')).toEqual({ device: 'desktop', browser: 'Other', os: 'Other' });
  });
});
