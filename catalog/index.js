/**
 * Addon catálogo JKAnime v1.0
 * - Lista / busca en jkanime.net
 * - IDs: jkanime:slug  (type series|movie)
 * - extra.tmdbId = URL completa del anime  → la app lo pasa a getStreams
 *   así SOLO esta fuente resuelve (no hay id numérico TMDB)
 * - getMeta: ficha + extra.seasons (1 temporada con N episodios)
 * - discover: tipos (animes, ovas, onas, peliculas, especiales) + géneros
 */

var BASE = 'https://jkanime.net';
var CDN = 'https://cdn.jkdesu.com';
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

var GENEROS = [
  'accion', 'artes-marciales', 'aventura', 'carreras', 'ciencia-ficcion',
  'comedia', 'demencia', 'demonios', 'deportes', 'drama', 'ecchi',
  'escolares', 'espacial', 'fantasia', 'harem', 'historico', 'infantil',
  'josei', 'juegos', 'magia', 'mecha', 'militar', 'misterio', 'musica',
  'parodia', 'policia', 'psicologico', 'romance', 'samurai', 'seinen',
  'shoujo', 'shounen', 'sobrenatural', 'superpoderes', 'suspenso',
  'terror', 'vampiros', 'yaoi', 'yuri',
];

var TIPOS = [
  { id: 'animes', label: 'Anime' },
  { id: 'ovas', label: 'OVAs' },
  { id: 'onas', label: 'ONAs' },
  { id: 'peliculas', label: 'Películas' },
  { id: 'especiales', label: 'Especiales' },
];

function headers(extra) {
  var h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    Referer: BASE + '/',
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      h[k] = extra[k];
    });
  }
  return h;
}

async function fetchHtml(url) {
  var res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' → ' + url);
  return await res.text();
}

async function fetchJson(url, opts) {
  opts = opts || {};
  var res = await fetch(url, {
    method: opts.method || 'GET',
    headers: headers(opts.headers),
    body: opts.body || undefined,
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' → ' + url);
  return await res.json();
}

function slugFromUrl(url) {
  if (!url) return '';
  var s = String(url).trim();
  // https://jkanime.net/slug/  → slug
  s = s.replace(/^https?:\/\/(www\.)?jkanime\.net\//i, '');
  s = s.replace(/\/+$/, '');
  s = s.split('/')[0];
  return s;
}

function animeUrl(slugOrUrl) {
  var slug = slugFromUrl(slugOrUrl);
  if (!slug) return '';
  return BASE + '/' + slug + '/';
}

function absUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  if (u.indexOf('http') === 0) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return BASE + u;
  return BASE + '/' + u;
}

function absImg(u) {
  if (!u) return null;
  u = String(u).trim();
  if (!u || u === 'null' || u === 'undefined') return null;
  if (u.indexOf('http') === 0) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  // Rutas del CDN jkdesu
  if (u.indexOf('cdn.jkdesu') >= 0 || u.indexOf('jkdesu.com') >= 0) {
    if (u.indexOf('http') !== 0) return 'https://' + u.replace(/^\/+/, '');
  }
  if (u.charAt(0) === '/') return CDN + u;
  // Si parece path de imagen de anime
  if (u.indexOf('animes/') === 0 || u.indexOf('assets/') === 0) {
    return CDN + '/' + u;
  }
  return CDN + '/' + u;
}

function mapTipoToType(tipo) {
  var t = String(tipo || '').toLowerCase();
  if (t.indexOf('pelicul') >= 0 || t === 'movie') return 'movie';
  return 'series';
}

function mapItemFromDirectorio(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var title = String(raw.title || raw.short_title || raw.name || '').trim();
  var url = absUrl(raw.url || raw.slug || '');
  var slug = slugFromUrl(url) || String(raw.slug || '').replace(/^\/+|\/+$/g, '');
  if (!slug) return null;
  if (!title) title = slug.replace(/-/g, ' ');
  var tipo = String(raw.tipo || raw.type || 'Anime');
  var type = mapTipoToType(tipo);
  var poster = absImg(raw.image || raw.poster || raw.img || '');
  if (!poster) {
    poster = CDN + '/assets/images/animes/image/' + slug + '.jpg';
  }
  var overview = String(raw.synopsis || raw.description || '').trim();
  var status = String(raw.status || raw.estado || '').trim();

  var id = 'jkanime:' + slug;
  var jkUrl = animeUrl(slug);

  return {
    id: id,
    title: title,
    name: title,
    type: type,
    overview: overview,
    poster: poster,
    posterUrl: poster,
    image: poster,
    genres: [],
    year: null,
    rating: null,
    extra: {
      source: 'jkanime',
      jkanimeSlug: slug,
      jkanimeUrl: jkUrl,
      // CLAVE: la app usa tmdbId para getStreams; aquí va la URL del anime
      tmdbId: jkUrl,
      mediaType: type === 'movie' ? 'movie' : 'tv',
      tipo: tipo,
      status: status,
    },
  };
}

function mapItemFromSearch(node) {
  // node ya es { title, url, image, status, type, data_g }
  var title = String(node.title || '').trim();
  var url = absUrl(node.url || '');
  var slug = slugFromUrl(url);
  if (!slug) return null;
  if (!title) title = slug.replace(/-/g, ' ');
  var tipo = String(node.type || 'Anime');
  var type = mapTipoToType(tipo);
  var jkUrl = animeUrl(slug);
  var poster = absImg(node.image || '');
  // Poster fallback por convención del CDN
  if (!poster && slug) {
    poster = CDN + '/assets/images/animes/image/' + slug + '.jpg';
  }
  return {
    id: 'jkanime:' + slug,
    title: title,
    name: title,
    type: type,
    overview: '',
    poster: poster,
    posterUrl: poster,
    image: poster,
    genres: [],
    year: null,
    rating: null,
    extra: {
      source: 'jkanime',
      jkanimeSlug: slug,
      jkanimeUrl: jkUrl,
      tmdbId: jkUrl,
      mediaType: type === 'movie' ? 'movie' : 'tv',
      tipo: tipo,
      status: String(node.status || ''),
    },
  };
}

function mapItemFromHomeCard(url, image, title, tipo, status) {
  var slug = slugFromUrl(url);
  if (!slug) return null;
  var t = String(title || '').trim() || slug.replace(/-/g, ' ');
  var type = mapTipoToType(tipo);
  var jkUrl = animeUrl(slug);
  var poster = absImg(image);
  if (!poster) {
    poster = CDN + '/assets/images/animes/image/' + slug + '.jpg';
  }
  return {
    id: 'jkanime:' + slug,
    title: t,
    name: t,
    type: type,
    overview: '',
    poster: poster,
    posterUrl: poster,
    image: poster,
    genres: [],
    year: null,
    rating: null,
    extra: {
      source: 'jkanime',
      jkanimeSlug: slug,
      jkanimeUrl: jkUrl,
      tmdbId: jkUrl,
      mediaType: type === 'movie' ? 'movie' : 'tv',
      tipo: String(tipo || ''),
      status: String(status || ''),
    },
  };
}

// ─── DIRECTORIO (JSON embebido) ───────────────────────────
async function fetchDirectorio(opts) {
  opts = opts || {};
  var page = opts.page || 1;
  var params = [];
  if (page > 1) params.push('p=' + page);
  if (opts.filtro) params.push('filtro=' + encodeURIComponent(opts.filtro));
  if (opts.tipo) params.push('tipo=' + encodeURIComponent(opts.tipo));
  if (opts.categoria) params.push('categoria=' + encodeURIComponent(opts.categoria));
  if (opts.genero) params.push('genero=' + encodeURIComponent(opts.genero));
  if (opts.orden) params.push('orden=' + encodeURIComponent(opts.orden));

  var url = BASE + '/directorio' + (params.length ? '?' + params.join('&') : '');
  // También probar rutas tipo /directorio/animes/
  if (opts.tipo && !opts.filtro && !opts.genero && page === 1) {
    url = BASE + '/directorio/' + opts.tipo + '/';
  }
  var html = await fetchHtml(url);

  // 1) JSON embebido: var animes = { data: [...], ... }
  var m = html.match(/var\s+animes\s*=\s*(\{[\s\S]*?\});/i);
  if (m) {
    var decoded;
    try {
      decoded = JSON.parse(m[1]);
      var data = decoded.data || decoded.animes || [];
      var items = [];
      for (var i = 0; i < data.length; i++) {
        var it = mapItemFromDirectorio(data[i]);
        if (it) items.push(it);
      }
      if (items.length) {
        return {
          items: items,
          currentPage: parseInt(decoded.current_page, 10) || page,
          lastPage: parseInt(decoded.last_page, 10) || 1,
          total: parseInt(decoded.total, 10) || items.length,
        };
      }
    } catch (e) {}
  }

  // 2) Fallback: scrape HTML de tarjetas anime__item / .g-0
  var htmlItems = parseAnimeItemsFromHtml(html);
  if (htmlItems.length) {
    return {
      items: htmlItems,
      currentPage: page,
      lastPage: page,
      total: htmlItems.length,
    };
  }

  return { items: [], currentPage: 1, lastPage: 1, total: 0 };
}

// ─── HOME (scraping ligero) ───────────────────────────────
function extractAttr(html, tagOpen, attr) {
  // helper muy simple
  var re = new RegExp(attr + '=["\']([^"\']+)["\']', 'i');
  var m = re.exec(tagOpen);
  return m ? m[1] : '';
}

async function parseHomeRows(html) {
  var rows = [];

  // Hero / recientes – cards genéricos con enlaces a anime
  // Top list (upto / lower)
  function collectCards(sectionLabel, classHint) {
    var items = [];
    // Busca bloques tipo div.toplist o anime__item
    var re = /<div[^>]*class="[^"]*(?:toplist|anime__item)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>)?/gi;
    var block;
    var seen = {};
    while ((block = re.exec(html)) && items.length < 24) {
      var chunk = block[0];
      var hrefM = /href=["'](https?:\/\/jkanime\.net\/[^"']+)["']/i.exec(chunk);
      if (!hrefM) hrefM = /href=["'](\/[^"']+)["']/i.exec(chunk);
      if (!hrefM) continue;
      var href = absUrl(hrefM[1]);
      var slug = slugFromUrl(href);
      if (!slug || seen[slug]) continue;
      // evitar enlaces a episodio /buscar /directorio
      if (/\/(episodio|buscar|directorio|genero|horario)\b/i.test(href)) continue;
      if (slug.indexOf('?') >= 0) continue;

      var imgM = /src=["']([^"']+)["']/i.exec(chunk);
      var titleM =
        /<(?:h5|h4|h3)[^>]*class="[^"]*card-title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)/i.exec(chunk) ||
        /alt=["']([^"']+)["']/i.exec(chunk) ||
        /title=["']([^"']+)["']/i.exec(chunk);
      var title = titleM ? titleM[1].trim() : slug.replace(/-/g, ' ');
      var it = mapItemFromHomeCard(href, imgM ? imgM[1] : '', title, 'Anime', '');
      if (it) {
        seen[slug] = true;
        items.push(it);
      }
    }
    if (items.length) {
      rows.push({ id: 'jkanime-' + classHint, title: sectionLabel, items: items });
    }
  }

  collectCards('Top anime', 'top');
  collectCards('Recientes', 'recent');

  // Si no hubo suficiente, rellenar con directorio
  if (rows.length === 0 || (rows[0] && rows[0].items.length < 6)) {
    try {
      var dir = await fetchDirectorio({ page: 1, tipo: 'animes' });
      if (dir.items.length) {
        rows.unshift({
          id: 'jkanime-animes',
          title: 'Últimos animes',
          items: dir.items.slice(0, 24),
        });
      }
    } catch (e) {}
  }

  return rows;
}

async function getHome(args, config) {
  var rows = [];

  try {
    var html = await fetchHtml(BASE + '/');
    rows = await parseHomeRows(html);
  } catch (e) {}

  // Filas por tipo
  var tiposHome = [
    { tipo: 'animes', title: 'Anime' },
    { tipo: 'ovas', title: 'OVAs' },
    { tipo: 'onas', title: 'ONAs' },
    { tipo: 'peliculas', title: 'Películas' },
    { tipo: 'especiales', title: 'Especiales' },
  ];

  for (var i = 0; i < tiposHome.length; i++) {
    try {
      var d = await fetchDirectorio({ page: 1, tipo: tiposHome[i].tipo });
      if (d.items.length) {
        // evitar duplicar si ya está en home scrape
        var exists = rows.some(function (r) {
          return r.id === 'jkanime-' + tiposHome[i].tipo;
        });
        if (!exists) {
          rows.push({
            id: 'jkanime-' + tiposHome[i].tipo,
            title: tiposHome[i].title,
            items: d.items.slice(0, 20),
          });
        }
      }
    } catch (e) {}
  }

  // Donghua
  try {
    var dong = await fetchDirectorio({ page: 1, categoria: 'donghua' });
    if (dong.items.length) {
      rows.push({
        id: 'jkanime-donghua',
        title: 'Donghua',
        items: dong.items.slice(0, 20),
      });
    }
  } catch (e) {}

  return { rows: rows };
}

/**
 * Parsea bloques div.anime__item del HTML de búsqueda / directorio.
 * Estructura actual (Storm / ani-scrapy):
 *   div.row div.anime__item
 *     a  → href
 *     .set-bg[data-setbg] o img[src] → poster
 *     .title o h5 a → título
 */
function parseAnimeItemsFromHtml(html) {
  var items = [];
  var seen = {};
  if (!html) return items;

  // Cortar por cada anime__item
  var re = /<div[^>]*class="[^"]*anime__item[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*anime__item|<\/div>\s*<\/div>\s*<\/div>|$)/gi;
  var block;
  while ((block = re.exec(html))) {
    var chunk = block[0] + (block[1] || '');

    // href: primer <a href="...">
    var hrefM =
      /<a[^>]*href=["']([^"']+)["'][^>]*>/i.exec(chunk);
    if (!hrefM) continue;
    var href = absUrl(hrefM[1]);
    var slug = slugFromUrl(href);
    if (!slug || seen[slug]) continue;
    if (/\/(buscar|directorio|genero|categoria)\b/i.test(href)) continue;

    // título: .title, h5>a, h5, alt de img
    var title = '';
    var tM =
      /class=["'][^"']*title[^"']*["'][^>]*>([^<]+)/i.exec(chunk) ||
      /<h5[^>]*>\s*<a[^>]*>([^<]+)/i.exec(chunk) ||
      /<h5[^>]*>([^<]+)/i.exec(chunk) ||
      /alt=["']([^"']+)["']/i.exec(chunk);
    if (tM) title = tM[1].replace(/\s+/g, ' ').trim();
    if (!title) title = slug.replace(/-/g, ' ');

    // poster: data-setbg en .set-bg, o src de img
    var img = '';
    var imgM =
      /class=["'][^"']*set-bg[^"']*["'][^>]*data-setbg=["']([^"']+)["']/i.exec(chunk) ||
      /data-setbg=["']([^"']+)["']/i.exec(chunk) ||
      /<img[^>]*src=["']([^"']+)["']/i.exec(chunk);
    if (imgM) img = imgM[1];

    var status = '';
    var statusM = /(?:status|estado)[^>]*>([^<]+)/i.exec(chunk);
    if (statusM) status = statusM[1].trim();

    var tipo = 'Anime';
    var typeM =
      /<li[^>]*class=["'][^"']*anime[^"']*["'][^>]*>([^<]+)/i.exec(chunk) ||
      /(?:tipo|type)[^>]*>([^<]+)/i.exec(chunk);
    if (typeM) tipo = typeM[1].trim();

    var it = mapItemFromSearch({
      title: title,
      url: href,
      image: img,
      status: status,
      type: tipo,
    });
    if (it && it.title) {
      seen[slug] = true;
      items.push(it);
    }
  }

  // Fallback más laxo: cualquier enlace a /slug/ con imagen cercana
  if (items.length === 0) {
    var linkRe = /<a[^>]*href=["'](https?:\/\/(?:www\.)?jkanime\.net\/([a-z0-9\-]+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var lm;
    while ((lm = linkRe.exec(html)) && items.length < 40) {
      var h = lm[1];
      var s = lm[2];
      if (!s || seen[s] || /buscar|directorio|genero|categoria|ajax/.test(s)) continue;
      var inner = lm[3] || '';
      var tit = '';
      var tm2 = />([^<]{2,80})</.exec(inner) || /alt=["']([^"']+)["']/.exec(inner);
      if (tm2) tit = tm2[1].trim();
      if (!tit) tit = s.replace(/-/g, ' ');
      var im = '';
      var im2 = /data-setbg=["']([^"']+)["']/.exec(inner) || /src=["']([^"']+)["']/.exec(inner);
      if (im2) im = im2[1];
      // buscar imagen un poco antes del enlace
      if (!im) {
        var before = html.substring(Math.max(0, lm.index - 400), lm.index);
        var im3 = /data-setbg=["']([^"']+)["']/.exec(before) || /src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i.exec(before);
        if (im3) im = im3[1];
      }
      var item = mapItemFromSearch({ title: tit, url: h, image: im, status: '', type: 'Anime' });
      if (item) {
        seen[s] = true;
        items.push(item);
      }
    }
  }

  return items;
}

async function search(args, config) {
  var q = (args && (args.query || args.q)) || '';
  q = String(q).trim();
  if (!q) return { items: [] };

  var items = [];
  var seen = {};
  var encoded = encodeURIComponent(q);

  // Estructura actual: /buscar/{query}/1/ , /2/ , /3/
  var pages = [1, 2, 3];
  for (var pi = 0; pi < pages.length; pi++) {
    var page = pages[pi];
    var url = BASE + '/buscar/' + encoded + '/' + page + '/';
    try {
      var html = await fetchHtml(url);
      // Si Cloudflare challenge, saltar
      if (/Just a moment|cf-browser-verification|challenge-platform/i.test(html)) {
        break;
      }
      var pageItems = parseAnimeItemsFromHtml(html);
      for (var i = 0; i < pageItems.length; i++) {
        var it = pageItems[i];
        var slug = (it.extra && it.extra.jkanimeSlug) || slugFromUrl(it.id);
        if (slug && !seen[slug]) {
          seen[slug] = true;
          items.push(it);
        }
      }
      // Si la página devolvió pocos, no seguir
      if (pageItems.length < 5) break;
    } catch (e) {
      break;
    }
  }

  // Fallback: directorio (var animes = {...}) filtrado por nombre
  if (items.length === 0) {
    try {
      var dir = await fetchDirectorio({ page: 1, filtro: 'nombre' });
      var ql = q.toLowerCase();
      var words = ql.split(/\s+/).filter(Boolean);
      items = (dir.items || []).filter(function (it) {
        var t = (it.title || '').toLowerCase();
        return words.every(function (w) {
          return t.indexOf(w) >= 0;
        });
      });
    } catch (e) {}
  }

  // Segundo fallback: buscar sin número de página
  if (items.length === 0) {
    try {
      var html2 = await fetchHtml(BASE + '/buscar/' + encoded);
      if (!/Just a moment|cf-browser-verification/i.test(html2)) {
        items = parseAnimeItemsFromHtml(html2);
      }
    } catch (e) {}
  }

  return { items: items };
}

async function discover(args, config) {
  var cat = (args && (args.category || args.tipo || args.type)) || 'animes';
  var page = parseInt((args && args.page) || 1, 10) || 1;
  var genero = (args && (args.genero || args.genre || args.genreId)) || null;
  var categoria = (args && args.categoria) || null;

  // Mapear categorías amigables de la app
  var tipo = '';
  var catLower = String(cat).toLowerCase();
  if (
    catLower === 'animes' ||
    catLower === 'anime' ||
    catLower === 'series' ||
    catLower === 'tv'
  ) {
    tipo = 'animes';
  } else if (catLower === 'ovas' || catLower === 'ova') {
    tipo = 'ovas';
  } else if (catLower === 'onas' || catLower === 'ona') {
    tipo = 'onas';
  } else if (
    catLower === 'peliculas' ||
    catLower === 'películas' ||
    catLower === 'movie' ||
    catLower === 'movies'
  ) {
    tipo = 'peliculas';
  } else if (catLower === 'especiales' || catLower === 'special') {
    tipo = 'especiales';
  } else if (catLower === 'donghua') {
    categoria = 'donghua';
    tipo = '';
  } else if (GENEROS.indexOf(catLower) >= 0) {
    genero = catLower;
    tipo = '';
  } else {
    // listar tipos + géneros como “categorías” si la app pide el índice
    tipo = catLower || 'animes';
  }

  if (genero && /^\d+$/.test(String(genero))) genero = null;

  var result = await fetchDirectorio({
    page: page,
    tipo: tipo || undefined,
    genero: genero || undefined,
    categoria: categoria || undefined,
  });

  return {
    items: result.items,
    page: result.currentPage,
    totalPages: result.lastPage,
    hasNext: result.currentPage < result.lastPage,
    // Ayuda a la UI de filtros
    filters: {
      types: TIPOS,
      genres: GENEROS,
    },
  };
}

// ─── GET META (ficha + episodios) ─────────────────────────
async function extractIdsFromPage(html, animeUrl) {
  var csrf = '';
  var csrfM = /name=["']csrf-token["']\s+content=["']([^"']+)["']/i.exec(html);
  if (csrfM) csrf = csrfM[1].trim();

  var animeId = 0;
  // data-anime en div.ml-2 (scraper actual), data-anime-id, anime_id, ajax paths
  var idM =
    /data-anime=["'](\d+)["']/i.exec(html) ||
    /data-anime-id=["'](\d+)["']/i.exec(html) ||
    /anime[_-]?id["']?\s*[:=]\s*["']?(\d+)/i.exec(html) ||
    /\/ajax\/pagination_episodes\/(\d+)\//i.exec(html) ||
    /\/ajax\/episodes\/(\d+)\//i.exec(html);
  if (idM) animeId = parseInt(idM[1], 10) || 0;

  // Páginas de episodios desde enlaces #pagN
  var pages = [];
  var pageRe = /href=["'][^"']*#pag(\d+)["']/gi;
  var pm;
  var seenP = {};
  while ((pm = pageRe.exec(html))) {
    var p = parseInt(pm[1], 10) || 1;
    if (!seenP[p]) {
      seenP[p] = true;
      pages.push(p);
    }
  }
  if (pages.length === 0) pages = [1];

  var slug = slugFromUrl(animeUrl);
  return { csrf: csrf, animeId: animeId, slug: slug, pages: pages };
}

function parseAnimeInfo(html, url) {
  var title = '';
  var tM =
    /class=["'][^"']*anime__details__title[^"']*["'][^>]*>[\s\S]*?<h3[^>]*>([^<]+)/i.exec(html) ||
    /<h1[^>]*>([^<]+)<\/h1>/i.exec(html) ||
    /<h3[^>]*>([^<]+)<\/h3>/i.exec(html) ||
    /<title>([^|<]+)/i.exec(html);
  if (tM) title = tM[1].replace(/\s*[-|].*$/, '').trim();

  var overview = '';
  var oM =
    /class=["'][^"']*anime__details__text[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(html) ||
    /<p[^>]*class="[^"]*(?:sinopsis|synopsis|description|text)[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(
      html
    ) ||
    /itemprop=["']description["'][^>]*>([\s\S]*?)</i.exec(html);
  if (oM) {
    overview = oM[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var poster = null;
  var pM =
    /<div[^>]*class="[^"]*anime__details__pic[^"]*"[^>]*data-setbg=["']([^"']+)["']/i.exec(
      html
    ) ||
    /class=["'][^"']*anime__details__pic[^"']*["'][^>]*data-setbg=["']([^"']+)["']/i.exec(html) ||
    /<img[^>]*class="[^"]*(?:poster|cover|anime)[^"]*"[^>]*src=["']([^"']+)["']/i.exec(
      html
    );
  if (pM) poster = absImg(pM[1]);

  var genres = [];
  var gRe = /\/genero\/([^"'\/]+)["']/gi;
  var gm;
  var seenG = {};
  while ((gm = gRe.exec(html))) {
    var g = decodeURIComponent(gm[1]).replace(/-/g, ' ');
    if (!seenG[g]) {
      seenG[g] = true;
      genres.push(g);
    }
  }

  var status = '';
  var sM = /(?:Estado|Status)[^:]*:\s*<\/?(?:[^>]+>)?\s*([^<\n]+)/i.exec(html);
  if (sM) status = sM[1].trim();

  var tipo = 'Anime';
  var tipoM = /(?:Tipo|Type)[^:]*:\s*<\/?(?:[^>]+>)?\s*([^<\n]+)/i.exec(html);
  if (tipoM) tipo = tipoM[1].trim();

  var totalEps = 0;
  var epM =
    /(?:Episodios|Episodes|Capítulos)[^:]*:\s*<\/?(?:[^>]+>)?\s*(\d+)/i.exec(
      html
    ) ||
    /data-total=["'](\d+)["']/i.exec(html);
  if (epM) totalEps = parseInt(epM[1], 10) || 0;

  return {
    title: title,
    overview: overview,
    poster: poster,
    genres: genres,
    status: status,
    tipo: tipo,
    totalEpisodes: totalEps,
  };
}

async function fetchEpisodesAjax(animeId, pages, animeUrl) {
  // Endpoint actual de JKAnime: GET /ajax/pagination_episodes/{id}/{page}/
  // (el antiguo POST /ajax/episodes/ + CSRF ya no funciona)
  if (!animeId) return [];
  var all = [];
  var pageList = Array.isArray(pages) && pages.length ? pages : [1];
  // Ordenar páginas numéricamente
  pageList = pageList.slice().sort(function (a, b) {
    return a - b;
  });

  for (var pi = 0; pi < pageList.length; pi++) {
    var page = pageList[pi];
    var url = BASE + '/ajax/pagination_episodes/' + animeId + '/' + page + '/';
    try {
      var res = await fetch(url, {
        method: 'GET',
        headers: headers({
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: animeUrl,
        }),
      });
      if (!res.ok) break;
      var text = await res.text();
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        break;
      }
      // Puede ser array directo o { data: [...] }
      var list = Array.isArray(data) ? data : data.data || data.episodes || [];
      if (!Array.isArray(list) || list.length === 0) break;

      for (var i = 0; i < list.length; i++) {
        var ep = list[i];
        var num =
          parseInt(ep.number || ep.episode || ep.episodio || ep.id, 10) ||
          all.length + 1;
        var epUrl =
          absUrl(ep.url || ep.link || '') ||
          animeUrl.replace(/\/$/, '') + '/' + num + '/';
        var img = ep.image || ep.thumbnail || '';
        if (img && img.indexOf('http') !== 0 && img.indexOf('/') !== 0) {
          img = CDN + '/assets/images/animes/video/image_thumb/' + img;
        }
        all.push({
          id: 'jkanime:' + slugFromUrl(animeUrl) + ':' + num,
          title: ep.title || 'Episodio ' + num,
          seasonNumber: 1,
          episodeNumber: num,
          overview: ep.synopsis || ep.description || '',
          poster: absImg(img),
          airDate: ep.date || null,
          extra: {
            jkanimeUrl: epUrl,
            tmdbId: epUrl,
          },
        });
      }
    } catch (e) {
      break;
    }
  }
  // Ordenar por número de episodio
  all.sort(function (a, b) {
    return (a.episodeNumber || 0) - (b.episodeNumber || 0);
  });
  return all;
}

function buildEpisodesFromTotal(slug, total) {
  var eps = [];
  var n = Math.min(total || 0, 500);
  for (var i = 1; i <= n; i++) {
    var epUrl = BASE + '/' + slug + '/' + i + '/';
    eps.push({
      id: 'jkanime:' + slug + ':' + i,
      title: 'Episodio ' + i,
      seasonNumber: 1,
      episodeNumber: i,
      overview: '',
      poster: null,
      airDate: null,
      extra: {
        jkanimeUrl: epUrl,
        tmdbId: epUrl,
      },
    });
  }
  return eps;
}

async function getMeta(args, config) {
  var id = (args && args.id) || '';
  var parts = String(id).split(':');

  var slug = '';
  if (parts[0] === 'jkanime' && parts.length >= 2) {
    slug = parts[1];
  } else if (String(id).indexOf('jkanime.net') >= 0) {
    slug = slugFromUrl(id);
  } else {
    slug = slugFromUrl(id) || String(id).replace(/^jkanime:/, '');
  }
  if (!slug) throw new Error('ID inválido: ' + id);

  var jkUrl = animeUrl(slug);
  var html = await fetchHtml(jkUrl);
  var info = parseAnimeInfo(html, jkUrl);
  var ids = await extractIdsFromPage(html, jkUrl);

  var type = mapTipoToType(info.tipo);
  var item = {
    id: 'jkanime:' + slug,
    title: info.title || slug.replace(/-/g, ' '),
    type: type,
    overview: info.overview || '',
    poster: info.poster,
    backdrop: info.poster,
    genres: info.genres || [],
    year: null,
    rating: null,
    extra: {
      source: 'jkanime',
      jkanimeSlug: slug,
      jkanimeUrl: jkUrl,
      tmdbId: jkUrl,
      mediaType: type === 'movie' ? 'movie' : 'tv',
      tipo: info.tipo,
      status: info.status,
      animeId: ids.animeId || null,
    },
  };

  // Temporadas / episodios (anime = 1 temporada)
  if (type === 'series') {
    var episodes = [];
    try {
      episodes = await fetchEpisodesAjax(
        ids.animeId,
        ids.pages,
        jkUrl
      );
    } catch (e) {}

    if (episodes.length === 0 && info.totalEpisodes > 0) {
      episodes = buildEpisodesFromTotal(slug, info.totalEpisodes);
    }

    // Si aún no hay total, intentar contar desde HTML
    if (episodes.length === 0) {
      var countM =
        /data-total=["'](\d+)["']/i.exec(html) ||
        /(?:Episodios|Episodes|Capítulos)\s*:\s*(\d+)/i.exec(html) ||
        /class=["'][^"']*numbers[^"']*["'][^>]*>[\s\S]*?(\d+)\s*<\/a>\s*$/im.exec(html);
      var total = countM ? parseInt(countM[1], 10) : 0;
      if (total > 0) episodes = buildEpisodesFromTotal(slug, total);
    }

    // Último recurso: si hay animeId pero 0 eps, generar al menos 1 y dejar que la fuente resuelva
    if (episodes.length === 0 && ids.animeId) {
      episodes = buildEpisodesFromTotal(slug, 12);
    }

    item.extra.seasons = [
      {
        seasonNumber: 1,
        name: 'Temporada 1',
        episodeCount: episodes.length || info.totalEpisodes || 0,
        overview: info.overview || '',
        airDate: null,
        poster: info.poster,
        episodes: episodes,
      },
    ];
    item.extra.episodeCount = episodes.length || info.totalEpisodes || 0;
  }

  return { item: item };
}

module.exports = {
  getHome: getHome,
  search: search,
  discover: discover,
  getMeta: getMeta,
};
