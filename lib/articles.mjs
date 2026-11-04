// Ported from hent_saker.py. Preserve front-page priority rather than sorting IDs.
export const ORIGIN = 'https://bygdebladet.com';
export function decode(s = '') {
  return s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
    const v = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
    return v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : '';
  }).replace(/&(amp|quot|apos|lt|gt|nbsp|ndash|mdash|hellip);/gi, (_, n) => ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'-',mdash:'-',hellip:'…'}[n.toLowerCase()]));
}
export function plain(s = '') { return decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
export function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3]);
  return out;
}
export function articleUrl(raw) {
  const u = new URL(raw, ORIGIN);
  if (u.protocol !== 'https:' || !['bygdebladet.com', 'www.bygdebladet.com'].includes(u.hostname) || u.port || u.username || u.password) throw new Error('Bruk en sakslenke fra bygdebladet.com.');
  const m = u.pathname.match(/\/19\.(?:1\.)?(\d{4,})\/?$/);
  if (!m) throw new Error('Lenken inneholder ikke et gyldig saksnummer.');
  u.hostname = 'bygdebladet.com'; u.search = ''; u.hash = '';
  return { id: m[1], url: u.href };
}
export function imageUrl(raw) {
  const u = new URL(raw, ORIGIN);
  if(u.protocol !== 'https:' || !['bygdebladet.com','www.bygdebladet.com'].includes(u.hostname) || u.port || u.username || u.password || !u.pathname.startsWith('/bilder/')) throw new Error('Bildet må ligge i nettavisens bildearkiv.');
  return u.href;
}
export function frontpage(html, limit = 5) {
  const result = [], seen = new Set();
  const tags = [...html.matchAll(/<a\b[^>]*>/gi)].map(m => attrs(m[0]));
  const editorial = tags.filter(a => /nf-o-fl-post-tittelbox__link/.test(a.class ?? ''));
  if(!editorial.length) throw new Error('Fant ikke redaksjonelle saksfelt på forsiden. Hentingen er stoppet slik at menylenker ikke blir importert.');
  for(const a of editorial) {
    try { const p = articleUrl(a.href); if(!seen.has(p.id)){seen.add(p.id); result.push({...p, rank:result.length + 1});} } catch {}
    if(result.length >= limit) break;
  }
  return result;
}
const places = {
  'ålesund':['ålesund','skodje','ørskog','sjøholt','spjelkavik','moa','ellingsøy','stette'],
  haram:['haram','brattvåg','søvik','vatne','tennfjord','lepsøy','hildre','harøy'],
  vestnes:['vestnes','tomrefjord','vikebukt','fiksdal','helland','rekdal'],
  fjord:['fjord kommune','stordal','norddal','valldal','eidsdal','tafjord'],
};
export function hashtags(text) {
  const words = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu,' ') + ' ';
  return ['#bygdebladet', ...Object.entries(places).filter(([,names])=>names.some(n=>words.includes(' '+n+' '))).map(([k])=>'#'+k)].join(' ');
}
export function parseArticle(html, url) {
  const meta = {};
  for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]); if(a.property || a.name) meta[a.property ?? a.name] = a.content ?? '';}
  const title = plain(meta['og:title'] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s*[-|–]\s*Bygdebladet.*$/i, '').replace(/[–—]/g,'-');
  if(!title) throw new Error('Saken mangler tittel.');
  const picture = imageUrl(meta['og:image'] || '');
  const intro = plain(meta['og:description'] || meta.description || '').replace(/[–—]/g,'-');
  // Restrict credit extraction to the main picture, never the entire article/page.
  const start = html.search(/class=["'][^"']*nf-c-artikkel__mainimg-container/);
  const scope = start < 0 ? '' : html.slice(start, start + 18000).split(/class=["'][^"']*(?:nf-c-artikkel__body|nf-c-artikkel__ingress|nf-c-paywall)/)[0];
  const captions = [...scope.matchAll(/<(?:span|div|p)[^>]*class=["'][^"']*(?:imgbyline|imgcredit|bildetekst|bildebyline|caption|fotobyline|byline)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p)>/gi)].map(m=>plain(m[1]));
  const caption = captions.join(' ');
  const ai = /(?:laga|laget|lagd|generert)\s+(?:med|av)\s+(?:KI|AI)|KI[- ](?:generert|illustrasjon)|illustrasjon:\s*KI/i.test(caption);
  const match = caption.match(/Foto:\s*([^|.]{2,100})/i);
  const credit = ai ? 'Illustrasjon: KI' : match ? 'Foto: '+match[1].trim() : '';
  const warnings = [];
  if(!credit) warnings.push('Fotokreditt må kontrolleres');
  if(/vald|vold|overgrep|mishandl|fengsel|sjukdom|sykdom|barn|dømd/i.test(title+' '+intro)) warnings.push('Vurder personvern og identifisering');
  const tags = hashtags(title+' '+intro);
  return {...articleUrl(url), title, intro, imageUrl:picture, category:meta['article:section'] || 'Nyheiter', credit, ai,
    facebookText:[intro, 'Les heile saka: '+url].filter(Boolean).join('\n\n'),
    instagramText:[intro,'Les heile saka på bygdebladet.com (lenke i bio)',tags].filter(Boolean).join('\n\n'),
    altText:'',cropX:0.5,cropY:0.4,channels:['facebook','instagram'],warnings};
}
