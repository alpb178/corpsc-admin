/**
 * Where a click happened, in words the hub panel can show: the zone of the page
 * (`section`) and the name of what was clicked (`label`).
 *
 * Nothing a visitor types is ever read. In private areas —an admin panel, an
 * account page— the text on screen can be someone's name or email, so there
 * only a label written by a developer (`data-track-label`, `aria-label`) is
 * sent, or the generic kind of element.
 */

export interface ClickTarget {
  element: Element;
  section: string;
  label: string;
}

/** What counts as clickable. Selectors without quotes on purpose. */
const CLICKABLE =
  'a[href], button, [role=button], input[type=submit], input[type=button], summary, [data-track-label]';

const LANDMARKS: Record<string, string> = {
  HEADER: 'header',
  NAV: 'nav',
  FOOTER: 'footer',
  ASIDE: 'aside',
  DIALOG: 'dialog',
  FORM: 'form',
  MAIN: 'main',
};

const MAX_SECTION = 64;
const MAX_LABEL = 120;

export function describeClick(target: EventTarget | null, isPrivate: boolean): ClickTarget | null {
  if (!(target instanceof Element)) return null;

  const element = target.closest(CLICKABLE);
  if (!element || element.closest('[data-track-ignore]')) return null;

  const label = isPrivate ? privateLabel(element) : publicLabel(element);
  if (!label) return null;

  return { element, section: sectionOf(element), label };
}

/**
 * True when the path belongs to an area whose screen text must not leave the
 * site. Looks at the first two segments so a locale prefix (`/es/admin`) is
 * covered too.
 */
export function isPrivatePath(path: string, privateSegments: readonly string[]): boolean {
  return path
    .split('/')
    .filter(Boolean)
    .slice(0, 2)
    .some((segment) => privateSegments.includes(segment));
}

function sectionOf(element: Element): string {
  const tagged = element.closest('[data-track-section]')?.getAttribute('data-track-section')?.trim();
  if (tagged) return tagged.slice(0, MAX_SECTION);

  for (let node = element.parentElement; node; node = node.parentElement) {
    if ((node.tagName === 'SECTION' || node.tagName === 'ARTICLE') && node.id) {
      return node.id.slice(0, MAX_SECTION);
    }
    const landmark = LANDMARKS[node.tagName];
    if (landmark) return landmark;
  }
  return 'page';
}

function publicLabel(element: Element): string {
  const explicit = developerLabel(element);
  if (explicit) return explicit;

  const text = element instanceof HTMLInputElement ? element.value : element.textContent ?? '';
  return (
    clean(text) ||
    clean(element.querySelector('img[alt]')?.getAttribute('alt') ?? '') ||
    clean(element.getAttribute('title') ?? '')
  ).slice(0, MAX_LABEL);
}

function privateLabel(element: Element): string {
  return developerLabel(element) || (element.matches('a[href]') ? 'link' : 'button');
}

function developerLabel(element: Element): string {
  return clean(
    element.getAttribute('data-track-label') ?? element.getAttribute('aria-label') ?? '',
  ).slice(0, MAX_LABEL);
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
