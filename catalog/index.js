/**
 * Addon catálogo JKAnime v1.1.2
 * Lógica alineada 1:1 con los scrapers Dart de la app:
 *   - buscar.dart      → search
 *   - directorio.dart  → discover / getHome fallback
 *   - content_api.dart → getMeta + episodios (POST /ajax/episodes/ + CSRF)
 *
 * IDs: jkanime:{slug}
 * extra.tmdbId = URL completa del anime (para que solo la fuente JKAnime resuelva)
 */

var BASE = 'https://jkanime.net';
var CDN = 'https://cdn.jkdesa.com';
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

// ─── HTTP ────────────────────────────────────────────────

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

async function fetchHtml(url, extraHeaders) {
  var res = await fetch(url, { headers: headers(extraHeaders) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' → ' + url);
  return await res.text();
}

// ─── UTILS ───────────────────────────────────────────────

function slugFromUrl(url) {
  if (!url) return '';
  var s = String(url).trim();
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
  // URL absoluta: dejar tal cual (solo normalizar protocolo //)
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.indexOf('http://') === 0 || u.indexOf('https://') === 0) return u;
  // Path relativo
  if (u.charAt(0) === '/') return CDN + u;
  if (u.indexOf('assets/') === 0 || u.indexOf('animes/') === 0) {
    return CDN + '/' + u;
  }
  // Solo nombre de archivo → poster del anime
  return CDN + '/assets/images/animes/image/' + u.replace(/^.*\//, '');
}

function mapTipoToType(tipo) {
  var t = String(tipo || '').toLowerCase();
  if (t.indexOf('pelicul') >= 0 || t === 'movie') return 'movie';
  return 'series';
}

function clean(text) {
  if (!text) return '';
  return String(text).replace(/\s+/g, ' ').trim();
}

// ─── MAPEO DE ÍTEMS (formato que espera la app) ──────────

function makeItem(opts) {
  var slug = opts.slug || slugFromUrl(opts.url || '');
  if (!slug) return null;
  var title = clean(opts.title) || slug.replace(/-/g, ' ');
  var tipo = opts.tipo || opts.type || 'Anime';
  var type = mapTipoToType(tipo);
  var jkUrl = animeUrl(slug);
  var poster = absImg(opts.image || opts.poster || '');
  if (!poster) {
    poster = CDN + '/assets/images/animes/image/' + slug + '.jpg';
  }
  return {
    id: 'jkanime:' + slug,
    title: title,
    name: title,
    type: type,
    overview: clean(opts.overview || opts.synopsis || ''),
    poster: poster,
    posterUrl: poster,
    image: poster,
    genres: opts.genres || [],
    year: opts.year || null,
    rating: opts.rating || null,
    extra: {
      source: 'jkanime',
      jkanimeSlug: slug,
      jkanimeUrl: jkUrl,
      tmdbId: jkUrl,
      mediaType: type === 'movie' ? 'movie' : 'tv',
      tipo: tipo,
      status: clean(opts.status || ''),
      animeId: opts.animeId || null,
    },
  };
}

// ─── DIRECTORIO (var animes = {...}) — igual que directorio.dart ──

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

  // var animes = {...};
  var m = html.match(/var\s+animes\s*=\s*(\{[\s\S]*?\});/i);
  if (!m) {
    // Fallback: scrape HTML de tarjetas
    var htmlItems = parseSearchHtml(html);
    return {
      items: htmlItems,
      currentPage: page,
      lastPage: page,
      total: htmlItems.length,
    };
  }

  var decoded;
  try {
    decoded = JSON.parse(m[1]);
  } catch (e) {
    return { items: [], currentPage: 1, lastPage: 1, total: 0 };
  }

  var data = decoded.data || [];
  var items = [];
  for (var i = 0; i < data.length; i++) {
    var raw = data[i];
    if (!raw || typeof raw !== 'object') continue;
    var it = makeItem({
      title: raw.title || raw.short_title || '',
      url: raw.url || '',
      image: raw.image || '',
      tipo: raw.tipo || raw.type || 'Anime',
      status: raw.status || raw.estado || '',
      overview: raw.synopsis || '',
      slug: slugFromUrl(raw.url || ''),
    });
    if (it) items.push(it);
  }

  return {
    items: items,
    currentPage: parseInt(decoded.current_page, 10) || page,
    lastPage: parseInt(decoded.last_page, 10) || 1,
    total: parseInt(decoded.total, 10) || items.length,
  };
}

// ─── BÚSQUEDA — igual que buscar.dart ────────────────────
// Selectores: div.page_directorio div.anime__item
//   h5 a → título + href
//   div.anime__item__pic[data-setbg] → imagen
//   div.anime__item__text ul li → status / tipo

function parseSearchHtml(html) {
  var items = [];
  var seen = {};
  if (!html) return items;

  // Cortar por cada anime__item
  var re =
    /<div[^>]*class="[^"]*anime__item[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*anime__item|<\/div>\s*<\/div>\s*<\/div>|$)/gi;
  var block;
  while ((block = re.exec(html))) {
    var chunk = block[0];

    // h5 a (igual que BuscarApi)
    var linkM =
      /<h5[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)/i.exec(chunk) ||
      /<a[^>]*href=["']([^"']*jkanime\.net[^"']*|\/[a-z0-9\-]+\/?)["'][^>]*>([^<]*)/i.exec(chunk);
    if (!linkM) continue;

    var href = absUrl(linkM[1]);
    var title = clean(linkM[2]);
    var slug = slugFromUrl(href);
    if (!slug || seen[slug]) continue;
    if (/\/(buscar|directorio|genero|categoria|ajax)\b/i.test(href)) continue;

    // Imagen: anime__item__pic / set-bg data-setbg, style url(), img src
    var image = '';
    var picM =
      /class=["'][^"']*anime__item__pic[^"']*["'][^>]*data-setbg=["']([^"']+)["']/i.exec(chunk) ||
      /class=["'][^"']*set-bg[^"']*["'][^>]*data-setbg=["']([^"']+)["']/i.exec(chunk) ||
      /data-setbg=["']([^"']+)["']/i.exec(chunk);
    if (picM) {
      image = picM[1] || picM[2] || '';
    }
    if (!image) {
      var styleM = /style=["'][^"']*url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(chunk);
      if (styleM) image = styleM[1];
    }
    if (!image) {
      var srcM = /<img[^>]*(?:src|data-src)=["']([^"']+)["']/i.exec(chunk);
      if (srcM) image = srcM[1];
    }

    // Status / tipo desde ul li
    var status = '';
    var tipo = 'Anime';
    var liRe = /<li[^>]*>([^<]+)/gi;
    var lis = [];
    var lm;
    while ((lm = liRe.exec(chunk))) {
      lis.push(clean(lm[1]));
    }
    if (lis.length > 0) status = lis[0];
    if (lis.length > 1) tipo = lis[1];

    if (!title) title = slug.replace(/-/g, ' ');

    var it = makeItem({
      title: title,
      url: href,
      image: image,
      tipo: tipo,
      status: status,
      slug: slug,
    });
    if (it) {
      seen[slug] = true;
      items.push(it);
    }
  }

  return items;
}

async function search(args, config) {
  var q = (args && (args.query || args.q)) || '';
  q = String(q).trim();
  if (!q) return { items: [] };

  var encoded = encodeURIComponent(q);
  // Igual que buscar.dart: /buscar/{query}  (sin número de página)
  var url = BASE + '/buscar/' + encoded;

  var items = [];
  try {
    var html = await fetchHtml(url);
    if (/Just a moment|cf-browser-verification|challenge-platform/i.test(html)) {
      // Cloudflare: intentar directorio como fallback
    } else {
      items = parseSearchHtml(html);
    }
  } catch (e) {}

  // Fallback: directorio filtrado por nombre
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

  return { items: items };
}

// ─── HOME ────────────────────────────────────────────────

async function getHome(args, config) {
  var rows = [];

  // Filas por tipo desde directorio (más fiable que scrape del home)
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
      if (d.items && d.items.length) {
        rows.push({
          id: 'jkanime-' + tiposHome[i].tipo,
          title: tiposHome[i].title,
          items: d.items.slice(0, 20),
        });
      }
    } catch (e) {}
  }

  // Donghua
  try {
    var dong = await fetchDirectorio({ page: 1, categoria: 'donghua' });
    if (dong.items && dong.items.length) {
      rows.push({
        id: 'jkanime-donghua',
        title: 'Donghua',
        items: dong.items.slice(0, 20),
      });
    }
  } catch (e) {}

  return { rows: rows };
}

// ─── DISCOVER ────────────────────────────────────────────

async function discover(args, config) {
  var cat = (args && (args.category || args.tipo || args.type)) || 'animes';
  var genero = (args && (args.genre || args.genero)) || '';
  var page = (args && (args.page || args.skip)) || 1;
  page = parseInt(page, 10) || 1;

  var opts = { page: page };
  var catL = String(cat).toLowerCase();

  if (catL === 'donghua') {
    opts.categoria = 'donghua';
  } else if (
    catL === 'animes' ||
    catL === 'ovas' ||
    catL === 'onas' ||
    catL === 'peliculas' ||
    catL === 'especiales'
  ) {
    opts.tipo = catL;
  } else if (catL === 'series' || catL === 'anime' || catL === 'tv') {
    opts.tipo = 'animes';
  } else if (catL === 'movie' || catL === 'movies') {
    opts.tipo = 'peliculas';
  }

  if (genero) opts.genero = String(genero).toLowerCase().replace(/\s+/g, '-');

  var dir = await fetchDirectorio(opts);
  return {
    items: dir.items || [],
    page: dir.currentPage,
    hasMore: dir.currentPage < dir.lastPage,
  };
}

// ─── GET META + EPISODIOS — igual que content_api.dart ───
// POST /ajax/episodes/{animeId}/{page}  con CSRF

function extractIdsFromPage(html, animeUrl) {
  var csrf = '';
  var csrfM = /name=["']csrf-token["']\s+content=["']([^"']+)["']/i.exec(html);
  if (csrfM) csrf = csrfM[1].trim();

  var animeId = 0;
  var idM = /data-anime=["'](\d+)["']/i.exec(html);
  if (idM) animeId = parseInt(idM[1], 10) || 0;

  var slug = slugFromUrl(animeUrl);
  return { csrf: csrf, animeId: animeId, slug: slug };
}

function parseAnimeInfo(html, url) {
  // Título: div.anime_info h3  (igual que content_api.dart)
  var title = '';
  var tM =
    /<div[^>]*class="[^"]*anime_info[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)/i.exec(html) ||
    /property=["']og:title["'][^>]*content=["']([^"']+)/i.exec(html) ||
    /<title>([^|<]+)/i.exec(html);
  if (tM) {
    title = clean(tM[1]).replace(/\s*[—\-–|]\s*Jk?Anime.*$/i, '').trim();
  }

  // Sinopsis: div.anime_info p.scroll
  var overview = '';
  var oM =
    /<div[^>]*class="[^"]*anime_info[^"]*"[^>]*>[\s\S]*?<p[^>]*class="[^"]*scroll[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html) ||
    /<p[^>]*class="[^"]*scroll[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (oM) {
    overview = clean(oM[1].replace(/<[^>]+>/g, ''));
  }

  // Poster: div.anime_pic img
  var poster = null;
  var pM =
    /<div[^>]*class="[^"]*anime_pic[^"]*"[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i.exec(html) ||
    /property=["']og:image["'][^>]*content=["']([^"']+)/i.exec(html);
  if (pM) poster = absImg(pM[1]);

  // Géneros, tipo, status
  var genres = [];
  var tipo = 'Anime';
  var status = '';
  var totalEps = 0;

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

  var tipoM = /(?:Tipo|Type)\s*:?\s*<\/?(?:[^>]+>)?\s*([^<\n]+)/i.exec(html);
  if (tipoM) tipo = clean(tipoM[1]);

  var statusM =
    /class=["'][^"']*enemision[^"']*["'][^>]*>([^<]+)/i.exec(html) ||
    /(?:Estado|Status)\s*:?\s*<\/?(?:[^>]+>)?\s*([^<\n]+)/i.exec(html);
  if (statusM) status = clean(statusM[1]);

  var epM = /(?:Episodios?)\s*:?\s*<\/?(?:[^>]+>)?\s*(\d+)/i.exec(html);
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

/**
 * POST /ajax/episodes/{animeId}/{page}  — igual que content_api.dart
 */
async function fetchEpisodesAjax(animeId, csrf, animeUrl, cookie) {
  if (!animeId || !csrf) return [];
  var all = [];
  var page = 1;
  var maxPages = 50;
  var total = 0;

  while (page <= maxPages) {
    var url = BASE + '/ajax/episodes/' + animeId + '/' + page;
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: headers({
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': csrf,
          Referer: animeUrl,
          Origin: BASE,
          Cookie: cookie || '',
        }),
        body: '_token=' + encodeURIComponent(csrf),
      });

      if (res.status === 419) break;
      if (!res.ok) break;

      var data = await res.json();
      var list = data.data || data.episodes || [];
      if (!Array.isArray(list) || list.length === 0) break;

      total = parseInt(data.total, 10) || total || 0;
      var slug = slugFromUrl(animeUrl);

      for (var i = 0; i < list.length; i++) {
        var ep = list[i];
        var num =
          parseInt(ep.number || ep.episode || ep.episodio || ep.id, 10) ||
          all.length + 1;

        var img = ep.image || '';
        var poster = null;
        if (img && String(img).length > 10) {
          var cleanImg = String(img).replace(/^\//, '');
          poster = CDN + '/assets/images/animes/video/image_thumb/' + cleanImg;
        } else {
          poster = CDN + '/assets/images/animes/image/' + slug + '.jpg';
        }

        var epUrl = BASE + '/' + slug + '/' + num + '/';

        all.push({
          id: 'jkanime:' + slug + ':' + num,
          title: 'Capítulo ' + num,
          name: 'Capítulo ' + num,
          seasonNumber: 1,
          episodeNumber: num,
          number: num,
          overview: '',
          poster: poster,
          still: poster,
          airDate: null,
          url: epUrl,
          extra: {
            jkanimeUrl: epUrl,
            tmdbId: epUrl,
            url_personalizada: epUrl,
          },
        });
      }

      if (total > 0 && all.length >= total) break;
      if (list.length < 12) break;
      page++;
    } catch (e) {
      break;
    }
  }

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
      title: 'Capítulo ' + i,
      name: 'Capítulo ' + i,
      seasonNumber: 1,
      episodeNumber: i,
      number: i,
      overview: '',
      poster: CDN + '/assets/images/animes/image/' + slug + '.jpg',
      still: CDN + '/assets/images/animes/image/' + slug + '.jpg',
      airDate: null,
      url: epUrl,
      extra: {
        jkanimeUrl: epUrl,
        tmdbId: epUrl,
        url_personalizada: epUrl,
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
    slug = parts.slice(1).join(':').replace(/\/+$/, '').split('/')[0];
  } else if (String(id).indexOf('jkanime.net') >= 0) {
    slug = slugFromUrl(id);
  } else {
    slug = slugFromUrl(id) || String(id).replace(/^jkanime:/, '');
  }
  if (!slug) throw new Error('ID inválido: ' + id);

  var jkUrl = animeUrl(slug);
  var html = await fetchHtml(jkUrl);
  var info = parseAnimeInfo(html, jkUrl);
  var ids = extractIdsFromPage(html, jkUrl);

  var type = mapTipoToType(info.tipo);
  var poster = info.poster || CDN + '/assets/images/animes/image/' + slug + '.jpg';

  var item = {
    id: 'jkanime:' + slug,
    title: info.title || slug.replace(/-/g, ' '),
    name: info.title || slug.replace(/-/g, ' '),
    type: type,
    overview: info.overview || '',
    poster: poster,
    posterUrl: poster,
    image: poster,
    backdrop: poster,
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
        ids.csrf,
        jkUrl,
        ''
      );
    } catch (e) {}

    if (episodes.length === 0 && info.totalEpisodes > 0) {
      episodes = buildEpisodesFromTotal(slug, info.totalEpisodes);
    }

    if (episodes.length === 0) {
      var countM = /data-total=["'](\d+)["']/i.exec(html);
      var total = countM ? parseInt(countM[1], 10) : 0;
      if (total > 0) episodes = buildEpisodesFromTotal(slug, total);
    }

    item.extra.seasons = [
      {
        seasonNumber: 1,
        season_number: 1,
        name: 'Temporada 1',
        episodeCount: episodes.length || info.totalEpisodes || 0,
        episode_count: episodes.length || info.totalEpisodes || 0,
        overview: info.overview || '',
        airDate: null,
        poster: poster,
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
