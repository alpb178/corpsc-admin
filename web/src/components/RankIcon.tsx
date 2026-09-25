import Image from 'next/image';
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
import { BrandIcon, brandOfBrowser, brandOfSource, brandOfSystem } from './BrandIcon';
import { groupSiteOf, logoOf } from '@/lib/navigation';

/** The dimensions that get a picture next to their name. */
export type RankKind = 'country' | 'device' | 'channel' | 'source' | 'browser' | 'os' | 'name';

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

const BOX = 'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px]';

/**
 * A small mark next to a ranked value, so a list of countries, sources or
 * browsers scans without reading every line. Decorative: the name is always
 * written next to it.
 *
 * A source shows the brand it is —Google, Instagram— or, when it is one of
 * the group's own sites, that site's logo; a browser or a system shows its
 * mark. All of it ships with the panel: it never asks the outside world for
 * a favicon. A brand it can't draw gets a letter tile, so nothing is left
 * blank; anything reserved or unknown gets a globe, and direct traffic a link.
 */
export function RankIcon({ kind, value }: { kind: RankKind; value: string }) {
  if (kind === 'country' && /^[A-Z]{2}$/.test(value)) {
    return (
      <span aria-hidden className={`${BOX} text-[16px] leading-none`}>
        {flagOf(value)}
      </span>
    );
  }

  if (kind === 'source' && value === '__direct__') {
    return <Tile Icon={Link2} />;
  }

  if (!value.startsWith('__')) {
    if (kind === 'source') {
      const site = groupSiteOf(value);
      const logo = site ? logoOf(site) : undefined;
      if (logo) {
        return <Image src={logo} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0 rounded-[5px] object-cover ring-1 ring-line" />;
      }
    }

    const brand =
      kind === 'source' ? brandOfSource(value) : kind === 'browser' ? brandOfBrowser(value) : kind === 'os' ? brandOfSystem(value) : undefined;
    if (brand) {
      return (
        <span aria-hidden className={`${BOX} bg-card ring-1 ring-line`}>
          <BrandIcon icon={brand} />
        </span>
      );
    }

    if (kind === 'source' || kind === 'browser' || kind === 'os' || kind === 'name') {
      return (
        <span aria-hidden className={`${BOX} bg-accent-soft text-[11px] font-bold uppercase text-accent`}>
          {value.replace(/^www\./, '').charAt(0)}
        </span>
      );
    }
  }

  const Icon = (kind === 'device' ? DEVICES[value] : kind === 'channel' ? CHANNELS[value] : undefined) ?? Globe;
  return <Tile Icon={Icon} />;
}

function Tile({ Icon }: { Icon: LucideIcon }) {
  return (
    <span aria-hidden className={`${BOX} bg-elevated text-fg-subtle`}>
      <Icon size={13} strokeWidth={2} />
    </span>
  );
}
