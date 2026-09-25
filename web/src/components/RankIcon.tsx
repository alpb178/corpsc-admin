import {
  ExternalLink,
  Globe,
  Handshake,
  Link2,
  Mail,
  Megaphone,
  Monitor,
  Play,
  Search,
  Share2,
  Smartphone,
  Tablet,
  Tv,
  type LucideIcon,
} from 'lucide-react';

/** The dimensions that get a picture next to their name. */
export type RankKind = 'country' | 'device' | 'channel' | 'source' | 'name';

const DEVICES: Record<string, LucideIcon> = {
  mobile: Smartphone,
  desktop: Monitor,
  tablet: Tablet,
  smart_tv: Tv,
};

const CHANNELS: Record<string, LucideIcon> = {
  'Organic Search': Search,
  'Paid Search': Megaphone,
  Direct: Link2,
  Referral: ExternalLink,
  'Organic Social': Share2,
  'Paid Social': Megaphone,
  Email: Mail,
  Display: Megaphone,
  Affiliates: Handshake,
  'Organic Video': Play,
  'Paid Video': Play,
};

/** "BO" → 🇧🇴, from the two regional-indicator letters. */
function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * A small mark next to a ranked value, so a list of countries, devices or
 * channels scans without reading every line. Decorative: the name is always
 * written next to it.
 *
 * A source is a domain, and there is no favicon without asking the outside
 * world for it, which the panel never does: it gets a letter tile instead,
 * as does any other named thing (a browser, an operating system). Anything
 * reserved or unknown gets a globe.
 */
export function RankIcon({ kind, value }: { kind: RankKind; value: string }) {
  const box = 'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px]';

  if (kind === 'country' && /^[A-Z]{2}$/.test(value)) {
    return (
      <span aria-hidden className={`${box} text-[16px] leading-none`}>
        {flagOf(value)}
      </span>
    );
  }

  if ((kind === 'source' || kind === 'name') && !value.startsWith('__')) {
    return (
      <span aria-hidden className={`${box} bg-accent-soft text-[11px] font-bold uppercase text-accent`}>
        {value.replace(/^www\./, '').charAt(0)}
      </span>
    );
  }

  const Icon = (kind === 'device' ? DEVICES[value] : kind === 'channel' ? CHANNELS[value] : undefined) ?? Globe;
  return (
    <span aria-hidden className={`${box} bg-elevated text-fg-subtle`}>
      <Icon size={13} strokeWidth={2} />
    </span>
  );
}
