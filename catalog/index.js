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
  if (u.indexOf('http') === 0) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return CDN + u;
  return CDN + '/' + u;
}

function mapTipoToType(tipo) {
  var t = String(tipo || '').toLowerCase();
  if (t.indexOf('pelicul') >= 0 || t === 'movie') return 'movie';
  return 'series';
}

function mapItemFromDirectorio(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var title = String(raw.title || raw.short_title || '').trim();
  if (!title) return null;
  var url = absUrl(raw.url || '');
  var slug = slugFromUrl(url);
  if (!slug) return null;
  var tipo = String(raw.tipo || raw.type || 'Anime');
  var type = mapTipoToType(tipo);
  var poster = absImg(raw.image || '');
  var overview = String(raw.synopsis || '').trim();
  var status = String(raw.status || raw.estado || '').trim();

  var id = 'jkanime:' + slug;
  var jkUrl = animeUrl(slug);

  return {
    id: id,
    title: title,
    type: type,
    overview: overview,
    poster: poster,
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
  if (!title || !slug) return null;
  var tipo = String(node.type || 'Anime');
  var type = mapTipoToType(tipo);
  var jkUrl = animeUrl(slug);
  return {
    id: 'jkanime:' + slug,
    title: title,
    type: type,
    overview: '',
    poster: absImg(node.image || ''),
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
  if (!slug || !title) return null;
  var type = mapTipoToType(tipo);
  var jkUrl = animeUrl(slug);
  return {
    id: 'jkanime:' + slug,
    title: String(title).trim(),
    type: type,
    overview: '',
    poster: absImg(image),
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
  var html = await fetchHtml(url);

  var m = html.match(/var\s+animes\s*=\s*(\{[\s\S]*?\});/i);
  if (!m) return { items: [], currentPage: 1, lastPage: 1, total: 0 };

  var decoded;
  try {
    decoded = JSON.parse(m[1]);
  } catch (e) {
    return { items: [], currentPage: 1, lastPage: 1, total: 0 };
  }

  var data = decoded.data || [];
  var items = [];
  for (var i = 0; i < data.length; i++) {
    var it = mapItemFromDirectorio(data[i]);
    if (it) items.push(it);
  }

  return {
    items: items,
    currentPage: parseInt(decoded.current_page, 10) || page,
    lastPage: parseInt(decoded.last_page, 10) || 1,
    total: parseInt(decoded.total, 10) || items.length,
  };
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

async function search(args, config) {
  var q = (args && (args.query || args.q)) || '';
  q = String(q).trim();
  if (!q) return { items: [] };

  var url = BASE + '/buscar/' + encodeURIComponent(q);
  var html = await fetchHtml(url);

  var items = [];
  var seen = {};

  // div.page_directorio div.anime__item
  var re = /<div[^>]*class="[^"]*anime__item[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*anime__item|$)/gi;
  var block;
  while ((block = re.exec(html))) {
    var chunk = block[0];
    var linkM =
      /<h5[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)/i.exec(chunk) ||
      /<a[^>]*href=["']([^"']*jkanime\.net[^"']*)["'][^>]*>([^<]*)/i.exec(chunk);
    if (!linkM) continue;
    var href = absUrl(linkM[1]);
    var title = (linkM[2] || '').trim();
    var slug = slugFromUrl(href);
    if (!slug || seen[slug]) continue;
    if (/\/(buscar|directorio)\b/i.test(href)) continue;

    var imgM = /(?:data-setbg|src)=["']([^"']+)["']/i.exec(chunk);
    var statusM = /(?:status|estado)[^>]*>([^<]+)/i.exec(chunk);
    var typeM = /(?:tipo|type)[^>]*>([^<]+)/i.exec(chunk);

    var it = mapItemFromSearch({
      title: title || slug.replace(/-/g, ' '),
      url: href,
      image: imgM ? imgM[1] : '',
      status: statusM ? statusM[1].trim() : '',
      type: typeM ? typeM[1].trim() : 'Anime',
    });
    if (it) {
      seen[slug] = true;
      items.push(it);
    }
  }

  // Fallback: si el HTML no matcheó, intentar directorio con filtro nombre
  if (items.length === 0) {
    try {
      var dir = await fetchDirectorio({ page: 1, filtro: 'nombre' });
      // filtrar localmente por query
      var ql = q.toLowerCase();
      items = dir.items.filter(function (it) {
        return (it.title || '').toLowerCase().indexOf(ql) >= 0;
      });
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
