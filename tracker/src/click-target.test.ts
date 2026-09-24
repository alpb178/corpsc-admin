import { describeClick, isPrivatePath } from './click-target';

function render(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('describeClick', () => {
  it('names a link by its text and its tagged section', () => {
    render('<section data-track-section="pricing"><a href="/plan" id="t">  Ver   planes </a></section>');
    expect(describeClick(document.getElementById('t'), false)).toMatchObject({ section: 'pricing', label: 'Ver planes' });
  });

  it('prefers what the developer wrote, then the aria label', () => {
    render('<main><button id="a" data-track-label="Comprar">Comprar ahora mismo</button><button id="b" aria-label="Cerrar">×</button></main>');
    expect(describeClick(document.getElementById('a'), false)?.label).toBe('Comprar');
    expect(describeClick(document.getElementById('b'), false)).toMatchObject({ label: 'Cerrar', section: 'main' });
  });

  it('climbs from an inner element to what is clickable', () => {
    render('<nav><a href="/x"><span id="inner">Inicio</span></a></nav>');
    expect(describeClick(document.getElementById('inner'), false)).toMatchObject({ section: 'nav', label: 'Inicio' });
  });

  it('uses the id of the section, the image alt or the title', () => {
    render('<section id="hero"><a href="/x" id="img"><img alt="Logo Take"></a><a href="/y" id="title" title="Ayuda"></a></section>');
    expect(describeClick(document.getElementById('img'), false)).toMatchObject({ section: 'hero', label: 'Logo Take' });
    expect(describeClick(document.getElementById('title'), false)?.label).toBe('Ayuda');
  });

  it('reads the value of a submit input, and falls back to the page as section', () => {
    render('<div><input type="submit" value="Enviar" id="s"></div>');
    expect(describeClick(document.getElementById('s'), false)).toMatchObject({ section: 'page', label: 'Enviar' });
  });

  it('never sends screen text in a private area', () => {
    render('<footer><a href="/me" id="l">ana@corpsc.com</a><button id="b">Luis Pérez</button><button id="t" data-track-label="Guardar">Guardar a Luis</button></footer>');
    expect(describeClick(document.getElementById('l'), true)?.label).toBe('link');
    expect(describeClick(document.getElementById('b'), true)?.label).toBe('button');
    expect(describeClick(document.getElementById('t'), true)?.label).toBe('Guardar');
  });

  it('ignores what is marked to ignore, what is not clickable and what has no name', () => {
    render('<div data-track-ignore><a href="/x" id="i">Secreto</a></div><p id="p">Texto</p><button id="e"></button>');
    expect(describeClick(document.getElementById('i'), false)).toBeNull();
    expect(describeClick(document.getElementById('p'), false)).toBeNull();
    expect(describeClick(document.getElementById('e'), false)).toBeNull();
    expect(describeClick(null, false)).toBeNull();
    expect(describeClick(document, false)).toBeNull();
  });
});

describe('isPrivatePath', () => {
  it('looks at the first two segments, so a locale prefix is covered', () => {
    expect(isPrivatePath('/admin/users', ['admin'])).toBe(true);
    expect(isPrivatePath('/es/account/orders', ['account'])).toBe(true);
    expect(isPrivatePath('/es/blog/account', ['account'])).toBe(false);
    expect(isPrivatePath('/', ['admin'])).toBe(false);
  });
});
