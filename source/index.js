/**
 * Fuente JKAnime
 * getStreams(tmdbId, type, season, episode)
 * extract(url) — resuelve embeds a HLS/MP4 (Voe, StreamWish, VidHide, Filemoon, Dood, OK.ru, etc.)
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

async function httpGet(url, extraHeaders) {
  try {
    var res = await fetch(url, {
      headers: headers(extraHeaders),
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

function isJkAnimeId(s) {
  if (s == null || s === '') return false;
  s = String(s).trim();
  if (s.indexOf('jkanime.net') >= 0) return true;
  if (s.indexOf('jkanime:') === 0) return true;
  if (s.indexOf('jkdesu') >= 0) return true;
  // slug simple sin espacios (la app a veces manda solo el slug)
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(s) && s.indexOf('http') !== 0) {
    return true;
  }
  return false;
}

function episodeUrlFrom(tmdbId, episode) {
  var raw = String(tmdbId || '').trim();
  if (/jkanime\.net\/[^\/]+\/\d+\/?/i.test(raw)) {
    return raw.replace(/\/?$/, '/');
  }
  var slug = '';
  if (raw.indexOf('jkanime:') === 0) {
    var parts = raw.split(':');
    slug = parts[1] || '';
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

function hostName(url) {
  try {
    var m = /https?:\/\/(?:www\.)?([^\/]+)/i.exec(url);
    return m ? m[1].split('.')[0] : 'Servidor';
  } catch (e) {
    return 'Servidor';
  }
}

function extractServidores(html) {
  var temp = [];

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
        if (remote) {
          temp.push({ name: name, url: fixHost(remote), language: lang });
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

  var iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  var im;
  var seen = {};
  while ((im = iframeRe.exec(html))) {
    var src2 = im[1];
    if (src2.indexOf('//') === 0) src2 = 'https:' + src2;
    src2 = fixHost(src2);
    if (seen[src2]) continue;
    if (
      /streamwish|flaswish|sfastwish|vidhide|voe|filemoon|mp4upload|yourupload|ok\.ru|dood|mixdrop|uqload|goodstream|lulu|filelions|hlswish|wishfast|awish/i.test(
        src2
      )
    ) {
      seen[src2] = true;
      temp.push({ name: hostName(src2), url: src2, language: 'Sub. Español' });
    }
  }

  temp.sort(function (a, b) {
    function score(n) {
      var l = String(n || '').toLowerCase();
      if (l.indexOf('servidor 1') >= 0) return 0;
      if (l.indexOf('servidor 2') >= 0) return 1;
      if (l.indexOf('streamwish') >= 0 || l.indexOf('stream wish') >= 0) return 2;
      if (l.indexOf('vidhide') >= 0 || l.indexOf('vid hide') >= 0) return 3;
      if (l.indexOf('voe') >= 0) return 4;
      if (l.indexOf('filemoon') >= 0) return 5;
      return 10;
    }
    return score(a.name) - score(b.name);
  });

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

// ═══════════════════════════════════════════════════════════
// EXTRACTORES HLS (lógica Latinuvio: cdn_resolvers + embeds)
// ═══════════════════════════════════════════════════════════

function unpackEval(script) {
  var m = String(script || '').match(
    /\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/
  );
  if (!m) return null;
  var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var radix = parseInt(m[2], 10);
  var symtab = m[4].split('|');
  function unbase(s) {
    var v = 0;
    for (var i = 0; i < s.length; i++) {
      var idx = chars.indexOf(s[i]);
      if (idx === -1) return NaN;
      v = v * radix + idx;
    }
    return v;
  }
  return m[1].replace(/\b([0-9a-zA-Z]+)\b/g, function (w) {
    var idx = unbase(w);
    return !isNaN(idx) && idx < symtab.length && symtab[idx] ? symtab[idx] : w;
  });
}

function extractM3u8(text) {
  if (!text) return null;
  var m =
    text.match(/["']hls["']\s*:\s*["'](https?:\/\/[^"']+)["']/i) ||
    text.match(/(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
    text.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
  if (!m) {
    var mp4 = text.match(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/i);
    return mp4 ? mp4[0].replace(/\\u0026/g, '&').replace(/\\\//g, '/') : null;
  }
  return (m[1] || m[0]).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
}

function isPlayable(u) {
  var s = String(u || '').toLowerCase();
  return (
    /\.m3u8(\?|$)/.test(s) ||
    /\.mp4(\?|$)/.test(s) ||
    /\.mpd(\?|$)/.test(s) ||
    /\/hls2?\//.test(s) ||
    /master\.m3u8/.test(s)
  );
}

function domainOf(url) {
  try {
    var m = /https?:\/\/([^\/]+)/i.exec(url);
    return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
  } catch (e) {
    return '';
  }
}

function originOf(url) {
  try {
    var m = /^(https?:\/\/[^\/]+)/i.exec(url);
    return m ? m[1] : '';
  } catch (e) {
    return '';
  }
}

async function resolveVoe(embedUrl) {
  var html = await httpGet(embedUrl, { Referer: embedUrl });
  if (!html) return null;
  if (html.indexOf('window.location.href') >= 0 && html.length < 2000) {
    var rm = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);
    if (rm) return resolveVoe(rm[1]);
  }
  // VOE encrypted JSON (ROT13 + noise + b64 + shift -3 + reverse + b64)
  var jm = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (jm) {
    try {
      var enc = JSON.parse(jm[1].trim());
      if (Array.isArray(enc)) enc = enc[0];
      if (typeof enc === 'string') {
        var d = enc.replace(/[a-zA-Z]/g, function (c) {
          var code = c.charCodeAt(0);
          var lim = c <= 'Z' ? 90 : 122;
          var s = code + 13;
          return String.fromCharCode(lim >= s ? s : s - 26);
        });
        ['@$', '^^', '~@', '%?', '*~', '!!', '#&'].forEach(function (n) {
          d = d.split(n).join('');
        });
        var s1 = b64decode(d);
        var sh = '';
        for (var i = 0; i < s1.length; i++) sh += String.fromCharCode(s1.charCodeAt(i) - 3);
        var data = JSON.parse(b64decode(sh.split('').reverse().join('')));
        var u = data && (data.source || data.direct_access_url);
        if (u) return { url: u, server: 'VOE', headers: { 'User-Agent': UA, Referer: embedUrl } };
      }
    } catch (e) {}
  }
  var m3 = extractM3u8(html);
  if (m3) return { url: m3, server: 'VOE', headers: { 'User-Agent': UA, Referer: embedUrl } };
  return null;
}

async function resolveStreamWish(embedUrl) {
  var rawId = ((embedUrl.match(/\/(?:e|v|embed)\/([^\/.?]+)/i) || [])[1] || embedUrl.split('/').pop() || '').replace(/\.html$/, '');
  if (!rawId) return null;
  var host = originOf(embedUrl) || 'https://streamwish.to';
  var mirrors = [
    host,
    'https://streamwish.to',
    'https://strwish.com',
    'https://flaswish.com',
    'https://awish.pro',
    'https://wishfast.top',
    'https://hlswish.com',
    'https://hglink.to',
    'https://hanerix.com',
  ];
  for (var mi = 0; mi < mirrors.length; mi++) {
    try {
      var base = mirrors[mi];
      var mirror = base + '/e/' + rawId;
      var html = await httpGet(mirror, { Referer: mirror });
      if (!html) continue;
      var m3u8 = null;
      var hash = html.match(/[0-9a-f]{32}/i);
      if (hash) {
        var dl =
          originOf(mirror) +
          '/dl?op=view&file_code=' +
          rawId +
          '&hash=' +
          hash[0] +
          '&embed=1&referer=&adb=1&hls4=1';
        var t = await httpGet(dl, { Referer: mirror });
        if (t) {
          var mm = t.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
          if (mm) m3u8 = mm[0];
        }
      }
      if (!m3u8) {
        var pm = html.match(/eval\s*\(\s*function\s*\(p,a,c,k,e,[a-z]\)[\s\S]*?\.split\('\|'\)[^)]*\)\)/);
        if (pm) {
          var up = unpackEval(pm[0]);
          if (up) m3u8 = extractM3u8(up);
        }
      }
      if (!m3u8) {
        var fm = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (fm) m3u8 = fm[1];
      }
      if (!m3u8) m3u8 = extractM3u8(html);
      if (m3u8) {
        return {
          url: m3u8,
          server: 'StreamWish',
          headers: { 'User-Agent': UA, Referer: mirror, Origin: originOf(mirror) },
        };
      }
    } catch (e) {}
  }
  return null;
}

async function resolveVidHide(embedUrl) {
  var html = await httpGet(embedUrl, { Referer: originOf(embedUrl) + '/' });
  if (!html) return null;
  var block = html.match(/eval\s*\(\s*function\s*\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\('\|'\)[^)]*\)\s*\)/);
  if (block) {
    var up = unpackEval(block[0]);
    if (up) {
      var hm = up.match(/"hls4"\s*:\s*"([^"]+)"/) || up.match(/"hls2"\s*:\s*"([^"]+)"/);
      if (hm) {
        var hls = hm[1];
        var origin = originOf(embedUrl);
        return {
          url: hls.indexOf('http') === 0 ? hls : origin + hls,
          server: 'VidHide',
          headers: { 'User-Agent': UA, Referer: origin + '/' },
        };
      }
      var m3u = extractM3u8(up);
      if (m3u) return { url: m3u, server: 'VidHide', headers: { 'User-Agent': UA, Referer: embedUrl } };
    }
  }
  var m3 = extractM3u8(html);
  return m3 ? { url: m3, server: 'VidHide', headers: { 'User-Agent': UA, Referer: embedUrl } } : null;
}

async function resolveFilemoon(embedUrl) {
  var html = await httpGet(embedUrl, { Referer: embedUrl });
  if (!html) return null;
  var m = extractM3u8(html);
  if (m) return { url: m, server: 'Filemoon', headers: { 'User-Agent': UA, Referer: embedUrl } };
  var evalMatch = html.match(/eval\s*\(\s*function\s*\(p,a,c,k/);
  if (evalMatch) {
    // take a larger chunk for unpack
    var chunk = html.substring(evalMatch.index, evalMatch.index + 8000);
    var up = unpackEval(chunk);
    if (up) {
      m = extractM3u8(up);
      if (m) return { url: m, server: 'Filemoon', headers: { 'User-Agent': UA, Referer: embedUrl } };
    }
  }
  return null;
}

async function resolveDood(embedUrl) {
  var html = await httpGet(embedUrl, { Referer: embedUrl });
  if (!html) return null;
  // pass_md5 path
  var pass = html.match(/\/pass_md5\/([^"'\\s]+)/i);
  if (pass) {
    try {
      var passUrl = originOf(embedUrl) + '/pass_md5/' + pass[1];
      var token = await httpGet(passUrl, { Referer: embedUrl });
      if (token && token.indexOf('http') === 0) {
        var finalUrl = token + (token.indexOf('?') >= 0 ? '&' : '?') + 'token=' + (pass[1].split('/').pop() || '') + '&expiry=' + Date.now();
        // dood often returns path that needs domain
        if (token.indexOf('http') !== 0) finalUrl = originOf(embedUrl) + token;
        else finalUrl = token;
        // classic dood: response is md5 path, append random + expiry
        var doodDirect = token.trim();
        if (doodDirect && doodDirect.indexOf('http') === 0) {
          return {
            url: doodDirect + (Math.random().toString(36).slice(2)) + '?token=' + (pass[1].split('/').pop() || '') + '&expiry=' + Date.now(),
            server: 'Dood',
            headers: { 'User-Agent': UA, Referer: originOf(embedUrl) + '/' },
          };
        }
      }
    } catch (e) {}
  }
  var m3 = extractM3u8(html);
  return m3 ? { url: m3, server: 'Dood', headers: { 'User-Agent': UA, Referer: embedUrl } } : null;
}

async function resolveOkru(embedUrl) {
  var html = await httpGet(embedUrl, { Referer: 'https://ok.ru/' });
  if (!html) return null;
  var m =
    html.match(/data-module="OKVideo"[^>]*data-options="([^"]+)"/i) ||
    html.match(/"videoSrc"\s*:\s*"([^"]+)"/i) ||
    html.match(/https?:\\\/\\\/[^"']+\.m3u8[^"']*/i);
  if (!m) {
    var m3 = extractM3u8(html.replace(/\\\//g, '/'));
    return m3 ? { url: m3, server: 'OK.ru', headers: { 'User-Agent': UA, Referer: 'https://ok.ru/' } } : null;
  }
  var raw = (m[1] || m[0] || '').replace(/&quot;/g, '"').replace(/\\\//g, '/');
  try {
    if (raw.charAt(0) === '{') {
      var opt = JSON.parse(raw);
      var flashvars = opt.flashvars || opt;
      var meta = flashvars.metadata || flashvars.metadataUrl;
      if (typeof meta === 'string' && meta.charAt(0) === '{') meta = JSON.parse(meta);
      if (meta && meta.videos && meta.videos.length) {
        var best = meta.videos[meta.videos.length - 1];
        var url = (best.url || best).replace(/\\\//g, '/');
        if (url) return { url: url, server: 'OK.ru', headers: { 'User-Agent': UA, Referer: 'https://ok.ru/' } };
      }
      if (meta && meta.hlsMasterPlaylistUrl) {
        return { url: meta.hlsMasterPlaylistUrl.replace(/\\\//g, '/'), server: 'OK.ru', headers: { 'User-Agent': UA, Referer: 'https://ok.ru/' } };
      }
    }
  } catch (e) {}
  var m3b = extractM3u8(raw);
  return m3b ? { url: m3b, server: 'OK.ru', headers: { 'User-Agent': UA, Referer: 'https://ok.ru/' } } : null;
}

async function resolveUqload(embedUrl) {
  var html = await httpGet(embedUrl);
  if (!html) return null;
  var sm = html.match(/sources\s*:\s*\[([^\]]+)\]/);
  if (!sm) {
    var pm = html.match(/eval\s*\(\s*function\s*\(p,a,c,k,e,[dr]\)[\s\S]*?\.split\('\|'\)[^)]*\)\)/);
    if (pm) {
      var up = unpackEval(pm[0]);
      if (up) sm = up.match(/sources\s*:\s*\[([^\]]+)\]/);
    }
  }
  if (!sm) return null;
  var url = extractM3u8(sm[1]) || (sm[1].match(/https?:\/\/[^\s"'<>]+/) || [])[0];
  if (!url || url.indexOf('http') !== 0) return null;
  return { url: url, server: 'Uqload', headers: { Referer: 'https://uqload.com/', 'User-Agent': UA } };
}

async function resolveGoodstream(embedUrl) {
  var html = await httpGet(embedUrl);
  if (!html) return null;
  var fm = html.match(/file\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
  if (fm) return { url: fm[1], server: 'GoodStream', headers: { Referer: 'https://goodstream.one/', Origin: 'https://goodstream.one', 'User-Agent': UA } };
  var m3 = extractM3u8(html);
  return m3 ? { url: m3, server: 'GoodStream', headers: { Referer: 'https://goodstream.one/', 'User-Agent': UA } } : null;
}

async function resolveMixdrop(embedUrl) {
  var html = await httpGet(embedUrl, { Referer: embedUrl });
  if (!html) return null;
  var evalMatch = html.match(/eval\s*\(\s*function\s*\(p,a,c,k/);
  if (evalMatch) {
    var chunk = html.substring(evalMatch.index, evalMatch.index + 12000);
    var up = unpackEval(chunk);
    if (up) {
      var m = up.match(/(?:MDCore\.wurl|wurl)\s*=\s*["']([^"']+)["']/i) || up.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i);
      if (m) {
        var u = m[1] || m[0];
        if (u.indexOf('//') === 0) u = 'https:' + u;
        return { url: u, server: 'Mixdrop', headers: { 'User-Agent': UA, Referer: originOf(embedUrl) + '/' } };
      }
    }
  }
  return null;
}

async function resolveMp4Upload(embedUrl) {
  var html = await httpGet(embedUrl);
  if (!html) return null;
  var m = html.match(/player\.src\s*\(\s*["']([^"']+)["']\s*\)/i) || html.match(/src\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
  if (m) return { url: m[1], server: 'Mp4Upload', headers: { 'User-Agent': UA, Referer: embedUrl } };
  var evalMatch = html.match(/eval\s*\(\s*function\s*\(p,a,c,k/);
  if (evalMatch) {
    var up = unpackEval(html.substring(evalMatch.index, evalMatch.index + 10000));
    if (up) {
      var m2 = extractM3u8(up) || (up.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/) || [])[0];
      if (m2) return { url: m2, server: 'Mp4Upload', headers: { 'User-Agent': UA, Referer: embedUrl } };
    }
  }
  return null;
}

async function resolveGeneric(embedUrl) {
  var html = await httpGet(embedUrl, { Referer: embedUrl });
  if (!html) return null;
  var m = extractM3u8(html);
  if (m) return { url: m, server: hostName(embedUrl), headers: { 'User-Agent': UA, Referer: embedUrl } };
  var evalMatch = html.match(/eval\s*\(\s*function\s*\(p,a,c,k/);
  if (evalMatch) {
    var up = unpackEval(html.substring(evalMatch.index, evalMatch.index + 12000));
    if (up) {
      m = extractM3u8(up);
      if (m) return { url: m, server: hostName(embedUrl), headers: { 'User-Agent': UA, Referer: embedUrl } };
    }
  }
  return null;
}

/**
 * Dispatcher: elige extractor según el host del embed.
 */
async function resolveEmbed(embedUrl) {
  if (!embedUrl || String(embedUrl).indexOf('http') !== 0) return null;
  var u = String(embedUrl).toLowerCase();
  var h = domainOf(embedUrl);
  var s = null;

  try {
    if (u.indexOf('voe') >= 0 || h.indexOf('voe') >= 0 || h.indexOf('marissa') >= 0) {
      s = await resolveVoe(embedUrl);
    } else if (
      u.indexOf('streamwish') >= 0 ||
      u.indexOf('strwish') >= 0 ||
      u.indexOf('flaswish') >= 0 ||
      u.indexOf('sfastwish') >= 0 ||
      u.indexOf('wishfast') >= 0 ||
      u.indexOf('hlswish') >= 0 ||
      u.indexOf('awish') >= 0 ||
      u.indexOf('filelions') >= 0 ||
      u.indexOf('wishembed') >= 0 ||
      u.indexOf('hglink') >= 0 ||
      u.indexOf('embedwish') >= 0
    ) {
      s = await resolveStreamWish(embedUrl);
    } else if (
      u.indexOf('vidhide') >= 0 ||
      u.indexOf('vidhidepro') >= 0 ||
      u.indexOf('dintezuvio') >= 0 ||
      u.indexOf('minochinos') >= 0 ||
      u.indexOf('luluvdo') >= 0 ||
      u.indexOf('vidguard') >= 0
    ) {
      s = await resolveVidHide(embedUrl);
    } else if (u.indexOf('filemoon') >= 0 || u.indexOf('moonembed') >= 0 || h.indexOf('moon') >= 0) {
      s = await resolveFilemoon(embedUrl);
    } else if (u.indexOf('dood') >= 0 || u.indexOf('ds2play') >= 0) {
      s = await resolveDood(embedUrl);
    } else if (u.indexOf('ok.ru') >= 0 || u.indexOf('odnoklassniki') >= 0) {
      s = await resolveOkru(embedUrl);
    } else if (u.indexOf('uqload') >= 0 || u.indexOf('oneupload') >= 0) {
      s = await resolveUqload(embedUrl);
    } else if (u.indexOf('goodstream') >= 0) {
      s = await resolveGoodstream(embedUrl);
    } else if (u.indexOf('mixdrop') >= 0) {
      s = await resolveMixdrop(embedUrl);
    } else if (u.indexOf('mp4upload') >= 0) {
      s = await resolveMp4Upload(embedUrl);
    } else {
      s = await resolveGeneric(embedUrl);
    }
  } catch (e) {
    s = null;
  }

  if (s && s.url && s.url !== embedUrl && isPlayable(s.url)) return s;
  // último intento genérico si el especializado falló
  if (!s) {
    try {
      s = await resolveGeneric(embedUrl);
    } catch (e) {}
  }
  if (s && s.url && isPlayable(s.url)) return s;
  return null;
}

/**
 * API pública extract(url) — usada por la app y por getStreams.
 */
async function extract(url, opts) {
  opts = opts || {};
  var u = String(url || '').trim();
  if (!u) return null;

  if (isPlayable(u)) {
    return { url: u, headers: { Referer: BASE + '/', 'User-Agent': UA } };
  }

  var resolved = await resolveEmbed(u);
  if (resolved && resolved.url) {
    return {
      url: resolved.url,
      headers: resolved.headers || { Referer: u, 'User-Agent': UA },
      server: resolved.server,
    };
  }
  return null;
}

async function getStreams(tmdbId, type, season, episode) {
  // La app pasa tmdbId = URL del capítulo o jkanime:slug o URL de serie
  if (tmdbId && typeof tmdbId === 'object') {
    var o = tmdbId;
    tmdbId = o.tmdbId || o.id || o.url || o.url_personalizada || '';
    type = type || o.type;
    season = season != null ? season : o.season;
    episode = episode != null ? episode : o.episode;
  }
  if (!isJkAnimeId(tmdbId)) {
    return [];
  }

  var epUrl = episodeUrlFrom(tmdbId, episode != null ? episode : 1);
  if (!epUrl) return [];

  var html = await httpGet(epUrl);
  if (!html) return [];

  var servers = extractServidores(html);
  var streams = [];

  for (var i = 0; i < servers.length; i++) {
    var s = servers[i];
    var streamUrl = s.url;
    var streamHeaders = { Referer: epUrl, 'User-Agent': UA };
    var isHls = /\.m3u8/i.test(streamUrl);
    var isDirect = isPlayable(streamUrl);
    var serverLabel = s.name;

    if (!isDirect) {
      try {
        var resolved = await extract(streamUrl);
        if (resolved && resolved.url) {
          streamUrl = resolved.url;
          if (resolved.headers) streamHeaders = resolved.headers;
          if (resolved.server) serverLabel = resolved.server + ' · ' + s.name;
          isHls = /\.m3u8/i.test(streamUrl);
          isDirect = isPlayable(streamUrl);
        }
      } catch (e) {}
    }

    // Solo devolver streams directos (HLS/MP4). Si no se pudo extraer, se omite.
    if (!isDirect) continue;

    streams.push({
      url: streamUrl,
      title: serverLabel + (s.language ? ' · ' + s.language : ''),
      quality: 'HD',
      provider: 'JKAnime',
      name: serverLabel,
      language: s.language || 'es',
      headers: streamHeaders,
      isHls: isHls,
    });
  }

  return streams;
}

module.exports = {
  getStreams: getStreams,
  extract: extract,
};