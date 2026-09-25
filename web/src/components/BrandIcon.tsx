import {
  siAndroid,
  siApple,
  siBaidu,
  siBrave,
  siDuckduckgo,
  siEcosia,
  siFacebook,
  siFirefox,
  siGithub,
  siGoogle,
  siGooglechrome,
  siInstagram,
  siIos,
  siLinux,
  siMacos,
  siMessenger,
  siOpera,
  siPerplexity,
  siPinterest,
  siReddit,
  siSafari,
  siSamsung,
  siSnapchat,
  siTelegram,
  siThreads,
  siTiktok,
  siWhatsapp,
  siX,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons';

/**
 * Brand marks the panel can draw by itself. The logos ship with the panel
 * (simple-icons, CC0): nothing is asked of the outside world, which is why
 * a brand missing here —LinkedIn, Edge, Windows, whose marks the set can't
 * carry— gets a letter tile rather than a favicon fetched from somewhere.
 */

/** A referring host, matched by suffix: "l.instagram.com" is Instagram. */
const SOURCES: Array<[suffix: string, icon: SimpleIcon]> = [
  ['google.', siGoogle],
  ['googleusercontent.com', siGoogle],
  ['facebook.com', siFacebook],
  ['fb.com', siFacebook],
  ['messenger.com', siMessenger],
  ['instagram.com', siInstagram],
  ['threads.net', siThreads],
  ['x.com', siX],
  ['twitter.com', siX],
  ['t.co', siX],
  ['youtube.com', siYoutube],
  ['youtu.be', siYoutube],
  ['whatsapp.com', siWhatsapp],
  ['wa.me', siWhatsapp],
  ['tiktok.com', siTiktok],
  ['telegram.org', siTelegram],
  ['t.me', siTelegram],
  ['pinterest.', siPinterest],
  ['reddit.com', siReddit],
  ['snapchat.com', siSnapchat],
  ['github.com', siGithub],
  ['duckduckgo.com', siDuckduckgo],
  ['ecosia.org', siEcosia],
  ['baidu.com', siBaidu],
  ['perplexity.ai', siPerplexity],
];

/** The tracker's browser families (`tracker/src/user-agent.ts`). */
const BROWSERS: Record<string, SimpleIcon> = {
  Chrome: siGooglechrome,
  Safari: siSafari,
  Firefox: siFirefox,
  Opera: siOpera,
  Brave: siBrave,
  'Samsung Internet': siSamsung,
  Instagram: siInstagram,
  Facebook: siFacebook,
  TikTok: siTiktok,
};

/** The tracker's operating-system families. */
const SYSTEMS: Record<string, SimpleIcon> = {
  Android: siAndroid,
  iOS: siIos,
  macOS: siMacos,
  Linux: siLinux,
  ChromeOS: siGooglechrome,
  Apple: siApple,
};

export function brandOfSource(host: string): SimpleIcon | undefined {
  const h = host.toLowerCase().replace(/^www\./, '');
  return SOURCES.find(([suffix]) => h === suffix || h.endsWith(`.${suffix}`) || (suffix.endsWith('.') && h.startsWith(suffix)) || h.includes(`.${suffix}`))?.[1];
}

export function brandOfBrowser(name: string): SimpleIcon | undefined {
  return BROWSERS[name];
}

export function brandOfSystem(name: string): SimpleIcon | undefined {
  return SYSTEMS[name];
}

/** The mark in its own colour, sized for a 22 px tile. */
export function BrandIcon({ icon, size = 14 }: { icon: SimpleIcon; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden data-brand={icon.slug}>
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}
