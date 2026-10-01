/**
 * Fuente JKAnime
 * getStreams(tmdbId, type, season, episode)
 *   - tmdbId = URL completa o slug de jkanime (lo pone el catálogo en extra.tmdbId)
 *   - season se ignora (siempre 1)
 *   - episode = número de episodio
 * Solo resuelve si el id pertenece a jkanime.net.
 */

var BASE = 'https://jkanime.net';
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function headers(extra) {
  var h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9',
    Referer: BASE + '/',
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      h[k] = extra[k];
    });
  }
  return h;
}

async function httpGet(url) {
  try {
    var res = await fetch(url, {
      headers: headers(),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

function slugFromUrl(url) {
  if (!url) return '';
  var s = String(url).trim();
  s = s.replace(/^https?:\/\/(www\.)?jkanime\.net\//i, '');
  s = s.replace(/\/+$/, '');
  return s.split('/')[0] || '';
}

function isJkAnimeId(id) {
  if (!id) return false;
  var s = String(id);
  if (s.indexOf('jkanime.net') >= 0) return true;
  if (s.indexOf('jkanime:') === 0) return true;
  // slug puro (sin : y sin espacios raros)
  if (/^[a-z0-9][a-z0-9\-]*$/i.test(s) && s.indexOf('tmdb') < 0) return true;
  return false;
}

function episodeUrlFrom(tmdbId, episode) {
  var raw = String(tmdbId || '').trim();

  // Ya es URL de episodio: https://jkanime.net/slug/12/
  if (/jkanime\.net\/[^\/]+\/\d+\/?/i.test(raw)) {
    return raw.replace(/\/?$/, '/');
  }

  var slug = '';
  if (raw.indexOf('jkanime:') === 0) {
    var parts = raw.split(':');
    slug = parts[1] || '';
    // jkanime:slug:ep
    if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
      episode = parseInt(parts[2], 10);
    }
  } else {
    slug = slugFromUrl(raw);
  }

  if (!slug) return null;
  var ep = parseInt(episode, 10) || 1;
  return BASE + '/' + slug + '/' + ep + '/';
}

function fixHost(url) {
  if (!url) return url;
  return String(url)
    .replace('https://sfastwish.com/', 'https://flaswish.com/')
    .replace('http://sfastwish.com/', 'https://flaswish.com/');
}

function b64decode(str) {
  try {
    if (typeof atob === 'function') return atob(str);
    // fallback Node
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf8');
    }
  } catch (e) {}
  return '';
}

function langName(code) {
  var n = parseInt(code, 10) || 1;
  var map = {
    1: 'Japonés - Sub. Español',
    2: 'Latino',
    3: 'Japonés - Sub. Inglés',
    4: 'Doblado al Español',
  };
  return map[n] || 'Sub. Español';
}

/**
 * Extrae servidores de la página del episodio (misma lógica que ServidoresApi).
 */
function extractServidores(html) {
  var temp = [];

  // 1) video[N] = '...iframe src=...'
  var videoRe = /video\[(\d+)\]\s*=\s*([^;]+);/gi;
  var vm;
  while ((vm = videoRe.exec(html))) {
    var index = parseInt(vm[1], 10) || 0;
    var content = vm[2] || '';
    var iframeM = /<iframe[^>]+src=["']([^"']+)["']/i.exec(content);
    if (iframeM) {
      var src = iframeM[1]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
      if (src.indexOf('//') === 0) src = 'https:' + src;
      if (index === 0 || index === 1) {
        temp.push({
          name: 'Servidor ' + (index + 1),
          url: fixHost(src),
          language: 'Sub. Español',
        });
      }
    }
  }

  // 2) var servers = [ {...}, ... ]
  var serversM = /var\s+servers\s*=\s*\[([\s\S]*?)\];/i.exec(html);
  if (serversM) {
    var serversJson = serversM[1]
      .replace(/,\s*\]/g, ']')
      .replace(/,\s*}/g, '}');
    var objRe = /\{([^}]+)\}/g;
    var om;
    while ((om = objRe.exec(serversJson))) {
      var objStr = om[1];
      var server = {};
      var pairs = objStr.split(',');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i];
        if (pair.indexOf(':') < 0) continue;
        var parts = pair.split(':');
        var key = parts[0].trim().replace(/["']/g, '');
        var value = parts.slice(1).join(':').trim().replace(/^["'\s]+|["'\s]+$/g, '');
        if (key === 'remote') {
          try {
            value = b64decode(value) || value;
          } catch (e) {}
        }
        server[key] = value;
      }
      if (server.server) {
        var remote = server.remote || '';
        var name = server.server;
        var lang = langName(server.lang || '1');
        var isVidHide =
          /vidhide|vid hide|vidhidepro/i.test(name) ||
          /vidhide|luluvdo|vidguard/i.test(remote);
        var isStreamWish =
          /streamwish|stream wish|flaswish|sfastwish/i.test(name) ||
          /streamwish|flaswish|sfastwish/i.test(remote);

        if ((isVidHide || isStreamWish) && remote) {
          temp.push({
            name: name,
            url: fixHost(remote),
            language: lang,
          });
        } else if (remote) {
          temp.push({
            name: name,
            url: fixHost(remote),
            language: lang,
          });
        } else if (server.slug) {
          temp.push({
            name: name,
            url: 'https://c1.jkplayers.com/d/' + server.slug + '/',
            language: lang,
          });
        }
      }
    }
  }

  // 3) iframes sueltos en la página
  var iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  var im;
  var seen = {};
  while ((im = iframeRe.exec(html))) {
    var src2 = im[1];
    if (src2.indexOf('//') === 0) src2 = 'https:' + src2;
    src2 = fixHost(src2);
    if (seen[src2]) continue;
    if (
      /streamwish|flaswish|vidhide|voe|filemoon|mp4upload|yourupload|ok\.ru|dood|mixdrop/i.test(
        src2
      )
    ) {
      seen[src2] = true;
      temp.push({
        name: hostName(src2),
        url: src2,
        language: 'Sub. Español',
      });
    }
  }

  // Ordenar prioridad
  temp.sort(function (a, b) {
    function score(n) {
      var l = String(n || '').toLowerCase();
      if (l.indexOf('servidor 1') >= 0) return 0;
      if (l.indexOf('servidor 2') >= 0) return 1;
      if (l.indexOf('streamwish') >= 0 || l.indexOf('stream wish') >= 0) return 2;
      if (l.indexOf('vidhide') >= 0 || l.indexOf('vid hide') >= 0) return 3;
      return 10;
    }
    return score(a.name) - score(b.name);
  });

  // Deduplicar por URL
  var out = [];
  var seenUrl = {};
  for (var j = 0; j < temp.length; j++) {
    var u = temp[j].url;
    if (!u || seenUrl[u]) continue;
    seenUrl[u] = true;
    out.push(temp[j]);
  }
  return out;
}

function hostName(url) {
  try {
    var m = /https?:\/\/(?:www\.)?([^\/]+)/i.exec(url);
    return m ? m[1].split('.')[0] : 'Servidor';
  } catch (e) {
    return 'Servidor';
  }
}

/**
 * Extractor simple de embeds conocidos (devuelve URL directa si es posible).
 * La app también puede usar extract() por separado.
 */
async function extract(url, opts) {
  opts = opts || {};
  var u = String(url || '').trim();
  if (!u) return null;

  // Ya es directo
  if (/\.m3u8(\?|$)/i.test(u) || /\.mp4(\?|$)/i.test(u)) {
    return { url: u, headers: { Referer: BASE + '/', 'User-Agent': UA } };
  }

  var html = await httpGet(u);
  if (!html) return null;

  // m3u8 / mp4 en el HTML
  var m3 =
    /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i.exec(html) ||
    /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i.exec(html) ||
    /source\s*:\s*["'](https?:\/\/[^"']+)["']/i.exec(html);
  if (m3) {
    return {
      url: m3[1] || m3[0],
      headers: { Referer: u, 'User-Agent': UA },
    };
  }

  var mp4 = /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i.exec(html);
  if (mp4) {
    return {
      url: mp4[0],
      headers: { Referer: u, 'User-Agent': UA },
    };
  }

  return null;
}

async function getStreams(tmdbId, type, season, episode) {
  // Solo responder si el id es de JKAnime
  if (!isJkAnimeId(tmdbId)) {
    return [];
  }

  var epUrl = episodeUrlFrom(tmdbId, episode || 1);
  if (!epUrl) return [];

  var html = await httpGet(epUrl);
  if (!html) return [];

  var servers = extractServidores(html);
  var streams = [];

  for (var i = 0; i < servers.length; i++) {
    var s = servers[i];
    var streamUrl = s.url;
    var isHls = /\.m3u8/i.test(streamUrl);
    var isDirect = isHls || /\.mp4/i.test(streamUrl);

    // Intentar resolver embed → directo
    if (!isDirect) {
      try {
        var resolved = await extract(streamUrl);
        if (resolved && resolved.url) {
          streamUrl = resolved.url;
          isHls = /\.m3u8/i.test(streamUrl);
          isDirect = true;
        }
      } catch (e) {}
    }

    streams.push({
      url: streamUrl,
      title: s.name + (s.language ? ' · ' + s.language : ''),
      quality: 'HD',
      provider: 'JKAnime',
      name: s.name,
      language: s.language || 'es',
      headers: {
        Referer: epUrl,
        'User-Agent': UA,
      },
      isHls: isHls,
      // Si no es directo, la app puede usar extract de nuevo
      behaviorHints: isDirect
        ? undefined
        : { notWebReady: true, proxyHeaders: { request: { Referer: epUrl } } },
    });
  }

  return streams;
}

module.exports = {
  getStreams: getStreams,
  extract: extract,
};
