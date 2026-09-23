/* Subscription Criteria — vanilla JS, hash-routed, reads CSV/JSON from /data. No build step. */
(function () {
  'use strict';

  var S = {
    versions: [], version: null, g: null,
    domestic: [], continental: [], international: [],
    domHist: [],
    index: [],
    list: {} // remembered filter/sort per section
  };

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    var h = rows.shift() || [];
    return rows.filter(function (r) { return r.join('').trim(); }).map(function (r) {
      var o = {}; h.forEach(function (k, j) { o[k] = (r[j] || '').trim(); }); return o;
    });
  }
  function get(p, json) {
    return fetch(p).then(function (r) { if (!r.ok) throw new Error(p); return json ? r.json() : r.text(); });
  }
  function csv(p) { return get(p).then(parseCSV); }

  /* ---------------- helpers ---------------- */
  function slug(s) { return String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function money(v) {
    var n = num(v); if (n === null) return '—';
    if (n >= 1000) return '€' + (n / 1000).toFixed(n >= 10000 ? 1 : 2) + 'bn';
    if (n >= 100) return '€' + Math.round(n) + 'M';
    if (n >= 10) return '€' + n.toFixed(1) + 'M';
    return '€' + n.toFixed(2) + 'M';
  }
  function snapLabel(id) {
    var m = String(id).match(/^(\d{4})-(\d{2})$/);
    if (!m) return id;
    return (m[2] === '03' ? 'Mar' : m[2] === '09' ? 'Sep' : m[2]) + ' ' + m[1].slice(2);
  }
  function versionLabel(id) { var v = S.versions.find(function (x) { return x.id === id; }); return v ? v.label : id; }
  function confedParts(c) { return String(c || '').split('-').map(function (s) { return s.trim(); }).filter(Boolean); }

  /* ---------------- market-value tiers (domestic only) ---------------- */
  var MVTIERS = [
    { n: 1, range: '≥ €200M' },
    { n: 2, range: '€40–200M' },
    { n: 3, range: '€30–40M' },
    { n: 4, range: '€8–30M' },
    { n: 5, range: '< €8M — not part of the tracked criteria' }
  ];
  function mvTier(avg) {
    if (avg === null) return 5;
    if (avg >= 200) return 1;
    if (avg >= 40) return 2;
    if (avg >= 30) return 3;
    if (avg >= 8) return 4;
    return 5;
  }
  function mvTierBadge(n) {
    var t = MVTIERS[n - 1];
    return '<span class="mvtier-badge t' + n + '" title="Tier ' + n + ' · ' + esc(t.range) + '">T' + n + '</span>';
  }

  /* ---------------- plain-language conditions ---------------- */
  function describe(tok) {
    var g = S.g, t = tok.trim();
    if (g.coverageWords[t]) return { short: g.coverageWords[t].short, long: g.coverageWords[t].long, kind: 'all' };
    if (g.roundCodes[t]) return { short: g.roundCodes[t].short, long: g.roundCodes[t].name, kind: 'round' };
    if (t === 'C') return { short: g.letterCodes.C.short, long: g.letterCodes.C.long, kind: 'rule' };
    var m = t.match(/^([A-Z])(\d+)$/);
    if (m && g.letterCodes[m[1]]) {
      var d = g.letterCodes[m[1]];
      return { short: d.short.replace('{N}', m[2]), long: d.long.replace('{N}', m[2]), kind: 'rule' };
    }
    return { short: t, long: 'Custom note from the source sheet.', kind: 'rule' };
  }
  function pills(str, small) {
    if (!str || !str.trim()) return '<span class="none">—</span>';
    var parts = str.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    return '<div class="pills">' + parts.map(function (p, i) {
      var d = describe(p);
      return (i ? '<span class="or-sep">or</span>' : '') +
        '<span class="pill ' + d.kind + (small ? ' sm' : '') + '" title="' + esc(d.long + '  [' + p + ']') + '">' + esc(d.short) + '</span>';
    }).join('') + '</div>';
  }
  function codeCell(str) {
    if (!str || !str.trim()) return '<span class="none">—</span>';
    var parts = str.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    return '<span class="code-list">' + parts.map(function (p, i) {
      var d = describe(p);
      return (i ? '<span class="or-sep-sm">/</span>' : '') + '<code title="' + esc(d.long) + '">' + esc(p) + '</code>';
    }).join('') + '</span>';
  }
  function ladder(imp, main, supp) {
    return '<div class="ladder">' + [['important', 'Important', imp], ['main', 'Main', main], ['supplementary', 'Supplementary', supp]].map(function (t) {
      var empty = !t[2] || !t[2].trim();
      return '<div class="rung' + (empty ? ' empty' : '') + '"><span class="tier ' + t[0] + '">' + t[1] + '</span>' +
        (empty ? '<span class="none">Not included</span>' : pills(t[2])) + '</div>';
    }).join('') + '</div>';
  }

  /* ---------------- sections config ---------------- */
  var SECTIONS = {
    domestic: {
      title: 'Domestic', data: function () { return S.domestic; }, nameKey: 'country',
      lede: 'One row per country, ranked by average club market value. The conditions shown are for the top-tier league — open a country for its second tier and cups.',
      defaultSort: { key: 'avg', dir: -1 }
    },
    continental: {
      title: 'Continental', data: function () { return S.continental; }, nameKey: 'competition',
      lede: 'Club competitions across borders, in priority order.',
      defaultSort: { key: 'rank', dir: 1 }
    },
    international: {
      title: 'International', data: function () { return S.international; }, nameKey: 'competition',
      lede: 'National-team competitions, in priority order.',
      defaultSort: { key: 'rank', dir: 1 }
    }
  };
  function nameOf(sec, r) { return r[SECTIONS[sec].nameKey]; }
  function listState(sec) {
    if (!S.list[sec]) S.list[sec] = { q: '', confed: '', sort: Object.assign({}, SECTIONS[sec].defaultSort) };
    return S.list[sec];
  }
  function sortVal(sec, r, key) {
    if (key === 'name') return nameOf(sec, r).toLowerCase();
    if (key === 'confed') return r.confederation.toLowerCase();
    if (key === 'avg') return num(r.average_market_value) || 0;
    if (key === 'total') return num(r.total_market_value) || 0;
    if (key === 'teams') return num(r.teams) || 0;
    if (key === 'rank') return num(r.rank) || 0;
    if (key === 'mvrank') return r._mvRank;
    return '';
  }
  function visibleRows(sec) {
    var st = listState(sec), q = st.q.trim().toLowerCase();
    var rows = SECTIONS[sec].data().filter(function (r) {
      if (st.confed && confedParts(r.confederation).indexOf(st.confed) === -1) return false;
      if (q && nameOf(sec, r).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var k = st.sort.key, d = st.sort.dir;
    return rows.slice().sort(function (a, b) {
      var x = sortVal(sec, a, k), y = sortVal(sec, b, k);
      return x < y ? -d : x > y ? d : 0;
    });
  }

  /* ---------------- list pages ---------------- */
  function pageList(sec, app) {
    var cfg = SECTIONS[sec], st = listState(sec), rows = cfg.data();
    var confeds = {};
    rows.forEach(function (r) { confedParts(r.confederation).forEach(function (c) { confeds[c] = (confeds[c] || 0) + 1; }); });
    var confedList = Object.keys(confeds).sort(function (a, b) { return confeds[b] - confeds[a] || a.localeCompare(b); });

    var cols = sec === 'domestic'
      ? [['mvrank', '#', ''], ['name', 'Country', ''], ['teams', 'Clubs', 'r hide-sm'], ['avg', 'Avg MV / club', 'r'], ['total', 'Total MV', 'r hide-sm'], [null, 'Important', 'hide-sm'], [null, 'Main', 'hide-sm'], [null, 'Supplementary', 'hide-sm']]
      : [['rank', '#', ''], ['name', 'Competition', ''], [null, 'Important', 'hide-sm'], [null, 'Main', 'hide-sm'], [null, 'Supplementary', 'hide-sm']];

    app.innerHTML =
      '<div class="eyebrow">' + esc(versionLabel(S.version)) + '</div>' +
      '<h1 class="page-title">' + cfg.title + '</h1>' +
      '<p class="page-lede">' + esc(cfg.lede) + '</p>' +
      (sec === 'domestic' ? '<div class="tier-legend">' + MVTIERS.map(function (t) { return '<span>' + mvTierBadge(t.n) + esc(t.range) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="toolbar"><input type="search" id="q" placeholder="Filter by name…" value="' + esc(st.q) + '">' +
      '<div class="confed-select-wrap"><label for="confeds" class="sr-only">Confederation</label><select id="confeds">' +
      '<option value="">All confederations</option>' +
      confedList.map(function (c) { return '<option value="' + esc(c) + '"' + (st.confed === c ? ' selected' : '') + '>' + esc(c) + ' (' + confeds[c] + ')</option>'; }).join('') +
      '</select></div></div>' +
      '<p class="count-line" id="count"></p>' +
      '<div class="table-card"><div class="table-scroll"><table class="data"><thead><tr>' +
      cols.map(function (c) {
        return '<th class="' + c[2] + (c[0] ? ' sortable' : '') + '"' + (c[0] ? ' data-k="' + c[0] + '"' : '') + '>' + c[1] + (c[0] ? '<span class="arrow"></span>' : '') + '</th>';
      }).join('') +
      '</tr></thead><tbody id="tb"></tbody></table></div></div>';

    var maxAvg = Math.max.apply(null, S.domestic.map(function (r) { return num(r.average_market_value) || 0; }));

    function draw() {
      var vis = visibleRows(sec);
      document.getElementById('count').textContent = vis.length + ' of ' + rows.length + (sec === 'domestic' ? ' countries' : ' competitions');
      app.querySelectorAll('th.sortable').forEach(function (th) {
        var on = th.getAttribute('data-k') === st.sort.key;
        th.classList.toggle('sorted', on);
        th.querySelector('.arrow').textContent = on ? (st.sort.dir === 1 ? '↑' : '↓') : '';
      });
      document.getElementById('tb').innerHTML = vis.map(function (r) {
        var href = '#/' + sec + '/' + slug(nameOf(sec, r));
        if (sec === 'domestic') {
          var avgN = num(r.average_market_value);
          var avg = avgN || 0;
          var w = maxAvg ? Math.max(2, Math.sqrt(avg / maxAvg) * 100) : 0;
          var tn = mvTier(avgN);
          return '<tr data-href="' + href + '" class="mvtier-' + tn + '">' +
            '<td class="rank">' + r._mvRank + '</td>' +
            '<td class="name"><a href="' + href + '">' + esc(r.country) + '</a><span class="confed">' + esc(r.confederation) + '</span></td>' +
            '<td class="r num hide-sm">' + esc(r.teams) + '</td>' +
            '<td class="r"><div class="mv-cell"><div class="mv-bar"><span style="width:' + w.toFixed(1) + '%"></span></div><span class="val">' + money(r.average_market_value) + '</span></div></td>' +
            '<td class="r num hide-sm">' + money(r.total_market_value) + '</td>' +
            '<td class="cond hide-sm">' + codeCell(r.top_tier_important) + '</td>' +
            '<td class="cond hide-sm">' + codeCell(r.top_tier_main) + '</td>' +
            '<td class="cond hide-sm">' + codeCell(r.top_tier_supplementary) + '</td></tr>';
        }
        return '<tr data-href="' + href + '">' +
          '<td class="rank">' + esc(r.rank) + '</td>' +
          '<td class="name"><a href="' + href + '">' + esc(r.competition) + '</a><span class="confed">' + esc(r.confederation) + '</span></td>' +
          '<td class="cond hide-sm">' + codeCell(r.important) + '</td>' +
          '<td class="cond hide-sm">' + codeCell(r.main) + '</td>' +
          '<td class="cond hide-sm">' + codeCell(r.supplementary) + '</td></tr>';
      }).join('') || '<tr><td colspan="' + cols.length + '" class="empty-note">Nothing matches that filter.</td></tr>';
    }

    document.getElementById('q').addEventListener('input', function (e) { st.q = e.target.value; draw(); });
    document.getElementById('confeds').addEventListener('change', function (e) {
      st.confed = e.target.value;
      draw();
    });
    app.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        if (st.sort.key === k) st.sort.dir *= -1;
        else st.sort = { key: k, dir: (k === 'name' || k === 'rank' || k === 'mvrank' || k === 'confed') ? 1 : -1 };
        draw();
      });
    });
    document.getElementById('tb').addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      var tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.getAttribute('data-href');
    });
    draw();
  }

  /* ---------------- detail pages ---------------- */
  function pager(sec, name) {
    var vis = visibleRows(sec), i = vis.findIndex(function (r) { return nameOf(sec, r) === name; });
    if (i === -1) return '';
    var prev = vis[i - 1], next = vis[i + 1];
    return '<span class="pager">' +
      (prev ? '<a href="#/' + sec + '/' + slug(nameOf(sec, prev)) + '">← ' + esc(nameOf(sec, prev)) + '</a>' : '') +
      (next ? '<a href="#/' + sec + '/' + slug(nameOf(sec, next)) + '">' + esc(nameOf(sec, next)) + ' →</a>' : '') + '</span>';
  }
  function tile(k, v, small) { return '<div class="tile"><div class="k">' + k + '</div><div class="v">' + v + (small ? '<small>' + small + '</small>' : '') + '</div></div>'; }
  function cutoffPanel(sec) {
    var list = S.g.globalCutoffs[sec];
    return '<div class="comp-card full-span"><h2>Also counts if</h2><div class="rung" style="border-top:0"><span class="tier" style="color:var(--ink-3)">Global cutoff</span>' +
      '<div class="pills">' + list.map(function (c, i) { return (i ? '<span class="or-sep">or</span>' : '') + '<span class="pill all" title="' + esc(c.long) + '">' + esc(c.short) + '</span>'; }).join('') + '</div></div></div>';
  }

  function pageDomestic(p, app) {
    var r = S.domestic.find(function (x) { return slug(x.country) === p.slug; });
    if (!r) return notFound(app, 'domestic');
    var comps = [['League · Top tier', 'top_tier'], ['League · Second tier', 'second_tier'], ['Main cup', 'main_cup'], ['League cup', 'league_cup'], ['Super cup', 'super_cup'], ['State championship', 'state_championship']];
    var cards = comps.filter(function (c) { return r[c[1] + '_important'] || r[c[1] + '_main'] || r[c[1] + '_supplementary']; });
    var tn = mvTier(num(r.average_market_value));
    var html =
      '<div class="crumbs"><a href="#/domestic">← Domestic</a>' + pager('domestic', r.country) + '</div>' +
      '<div class="detail-hero"><div><div class="eyebrow">' + esc(r.confederation) + ' · ' + esc(versionLabel(S.version)) + '</div><h1 class="page-title">' + esc(r.country) + '</h1></div></div>' +
      '<div class="tiles">' +
      tile('MV rank', '#' + r._mvRank, 'of ' + S.domestic.length) +
      tile('Tier', '<span class="mvtier-t' + tn + '">T' + tn + '</span>', MVTIERS[tn - 1].range) +
      tile('Top-tier clubs', esc(r.teams)) +
      tile('Avg MV / club', money(r.average_market_value)) +
      tile('Total MV', money(r.total_market_value)) +
      '</div><div class="comp-grid">';
    if (!cards.length) html += '<div class="comp-card full-span"><h2>No competition-specific rules</h2><p class="empty-note" style="margin:0 0 12px">Nothing in this country is covered by its own conditions — matches only count through the global cutoff below.</p></div>';
    cards.forEach(function (c) {
      html += '<div class="comp-card"><h2>' + c[0] + '</h2>' + ladder(r[c[1] + '_important'], r[c[1] + '_main'], r[c[1] + '_supplementary']) + '</div>';
    });
    html += cutoffPanel('domestic') + '</div>';

    var pts = S.domHist.filter(function (h) { return h.country === r.country && h.tier === '1'; })
      .map(function (h) { return { x: h.snapshot, y: num(h.average_market_value) }; });
    if (!pts.some(function (q) { return q.x === S.version; }) && num(r.average_market_value) !== null) pts.push({ x: S.version, y: num(r.average_market_value) });
    pts.sort(function (a, b) { return a.x < b.x ? -1 : 1; });
    html += chartCard('Average club market value', 'Top-tier league, per snapshot', pts);
    app.innerHTML = html;
    bindChart(app);
  }

  function pageComp(sec, p, app) {
    var list = SECTIONS[sec].data();
    var r = list.find(function (x) { return slug(x.competition) === p.slug; });
    if (!r) return notFound(app, sec);
    var html =
      '<div class="crumbs"><a href="#/' + sec + '">← ' + SECTIONS[sec].title + '</a>' + pager(sec, r.competition) + '</div>' +
      '<div class="detail-hero"><div><div class="eyebrow">' + esc(r.confederation) + ' · ' + esc(versionLabel(S.version)) + '</div><h1 class="page-title">' + esc(r.competition) + '</h1></div></div>';
    html += '<div class="tiles">' + tile('Priority', '#' + esc(r.rank), 'of ' + list.length) + tile('Confederation', esc(r.confederation)) + '</div>';
    html += '<div class="comp-grid"><div class="comp-card full-span"><h2>Conditions</h2>' + ladder(r.important, r.main, r.supplementary) + '</div>' + cutoffPanel(sec) + '</div>';
    app.innerHTML = html;
  }

  function notFound(app, sec) {
    app.innerHTML = '<h1 class="page-title">Not found</h1><p class="page-lede">That entry isn\'t in ' + esc(versionLabel(S.version)) + '. <a href="#/' + sec + '">Back to the list</a>.</p>';
  }

  /* ---------------- chart ---------------- */
  function chartCard(title, sub, pts) {
    pts = pts.filter(function (q) { return q.y !== null; });
    if (!pts.length) return '';
    var body;
    if (pts.length < 2) body = '<p class="empty-note">Only one data point so far (' + esc(snapLabel(pts[0].x)) + ': ' + money(pts[0].y) + ').</p>';
    else {
      var W = 720, H = 220, L = 52, R = 56, T = 18, B = 30;
      var ys = pts.map(function (q) { return q.y; });
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
      lo = Math.max(0, lo - pad); hi = hi + pad;
      var iw = W - L - R, ih = H - T - B;
      var X = function (i) { return L + (pts.length === 1 ? iw / 2 : i * iw / (pts.length - 1)); };
      var Y = function (v) { return T + ih - (v - lo) / (hi - lo) * ih; };
      var grid = '';
      for (var g = 0; g <= 3; g++) {
        var v = lo + (hi - lo) * g / 3, y = Y(v);
        grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line-soft)" stroke-width="1"' + (g === 0 ? ' style="stroke:var(--line)"' : '') + '/>' +
          '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-3)">' + money(v) + '</text>';
      }
      var d = pts.map(function (q, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(q.y).toFixed(1); }).join(' ');
      var area = d + ' L' + X(pts.length - 1).toFixed(1) + ' ' + (T + ih) + ' L' + X(0).toFixed(1) + ' ' + (T + ih) + ' Z';
      var marks = pts.map(function (q, i) {
        return '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="var(--ink-3)">' + esc(snapLabel(q.x)) + '</text>' +
          '<circle class="pt" data-i="' + i + '" cx="' + X(i) + '" cy="' + Y(q.y) + '" r="4.5" fill="var(--surface)" stroke="var(--bar)" stroke-width="2"/>';
      }).join('');
      var last = pts[pts.length - 1];
      var hits = pts.map(function (q, i) {
        var w = iw / Math.max(1, pts.length - 1);
        return '<rect class="hit" data-i="' + i + '" data-t="' + esc(snapLabel(q.x) + ' · ' + money(q.y)) + '" data-x="' + X(i) + '" data-y="' + Y(q.y) + '" x="' + (X(i) - w / 2) + '" y="' + T + '" width="' + w + '" height="' + ih + '" fill="transparent"/>';
      }).join('');
      body = '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' +
        '<defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--bar)" stop-opacity=".22"/><stop offset="1" stop-color="var(--bar)" stop-opacity="0"/></linearGradient></defs>' +
        grid + '<path d="' + area + '" fill="url(#ga)"/>' +
        '<path d="' + d + '" fill="none" stroke="var(--bar)" stroke-width="2" stroke-linejoin="round"/>' + marks +
        '<text x="' + (X(pts.length - 1) + 10) + '" y="' + (Y(last.y) + 4) + '" font-size="12" font-weight="700" fill="var(--ink)">' + money(last.y) + '</text>' +
        hits + '</svg><div class="chart-tip"></div></div>';
    }
    return '<div class="chart-card"><h2>' + esc(title) + '</h2><p class="sub">' + esc(sub) + '</p>' + body + '</div>';
  }
  function bindChart(app) {
    app.querySelectorAll('.chart').forEach(function (c) {
      var svg = c.querySelector('svg'), tip = c.querySelector('.chart-tip');
      c.querySelectorAll('.hit').forEach(function (h) {
        h.addEventListener('mouseenter', function () {
          var box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, s = box.width / vb.width;
          tip.textContent = h.getAttribute('data-t');
          tip.style.left = (parseFloat(h.getAttribute('data-x')) * s) + 'px';
          tip.style.top = (parseFloat(h.getAttribute('data-y')) * s) + 'px';
          tip.style.display = 'block';
          c.querySelectorAll('.pt').forEach(function (p) { p.setAttribute('r', p.getAttribute('data-i') === h.getAttribute('data-i') ? 6 : 4.5); });
        });
        h.addEventListener('mouseleave', function () {
          tip.style.display = 'none';
          c.querySelectorAll('.pt').forEach(function (p) { p.setAttribute('r', 4.5); });
        });
      });
    });
  }

  /* ---------------- home ---------------- */
  function pageHome(p, app) {
    var g = S.g;
    function card(sec, desc, topRows, valFn) {
      return '<a class="s-card" href="#/' + sec + '"><div class="s-card-top"><h3>' + SECTIONS[sec].title + '</h3><span class="count">' + SECTIONS[sec].data().length + '</span></div>' +
        '<p class="desc">' + desc + '</p><ol>' + topRows.map(function (r, i) {
          return '<li><span class="k">' + (i + 1) + '</span><span class="n">' + esc(nameOf(sec, r)) + '</span><span class="v">' + valFn(r) + '</span></li>';
        }).join('') + '</ol><span class="go">Browse ' + SECTIONS[sec].title.toLowerCase() + ' →</span></a>';
    }
    var byMV = S.domestic.slice().sort(function (a, b) { return a._mvRank - b._mvRank; }).slice(0, 4);
    var byRank = function (l) { return l.slice().sort(function (a, b) { return num(a.rank) - num(b.rank); }).slice(0, 4); };
    app.innerHTML =
      '<section class="hero">' + pitchSVG() +
      '<div class="eyebrow">' + esc(versionLabel(S.version)) + ' standard</div>' +
      '<h1>Which matches<br>make the cut</h1>' +
      '<p>My personal standard for subscribing to football — every league, cup and tournament I follow, and exactly which of their matches count. Revised every March and September, mostly on transfer-market values.</p>' +
      '<div class="search"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8.5" cy="8.5" r="6"/><path d="M13 13l5 5"/></svg>' +
      '<input type="search" id="hs" placeholder="Search a country or competition…" autocomplete="off"><div class="search-results" id="hr"></div></div>' +
      '</section>' +
      '<div class="section-cards">' +
      card('domestic', 'Countries, by average club value', byMV, function (r) { return money(r.average_market_value); }) +
      card('continental', 'Club competitions, by priority', byRank(S.continental), function (r) { return '#' + r.rank; }) +
      card('international', 'National-team events, by priority', byRank(S.international), function (r) { return '#' + r.rank; }) +
      '</div>' +
      '<div class="section-head"><h2>Reading the criteria</h2><a class="aside" href="#/guide">Full guide →</a></div>' +
      '<div class="two-col">' +
      '<div class="panel"><h3>Three tiers per competition</h3><ul class="legend-list">' +
      g.tiers.map(function (t) { return '<li><span class="tier ' + t.key + '">' + t.name + '</span><span class="note">' + esc(t.blurb) + '</span></li>'; }).join('') +
      '</ul><p class="fine">' + esc(g.separator) + '</p></div>' +
      '<div class="panel"><h3>Global cutoffs</h3><div class="cutoff-list">' +
      ['domestic', 'continental', 'international'].map(function (k) {
        return '<div class="cutoff-row"><span class="lbl">' + SECTIONS[k].title + '</span><div class="pills">' +
          g.globalCutoffs[k].map(function (c, i) { return (i ? '<span class="or-sep">or</span>' : '') + '<span class="pill all sm" title="' + esc(c.long) + '">' + esc(c.short) + '</span>'; }).join('') + '</div></div>';
      }).join('') + '</div><p class="fine">' + esc(g.globalCutoffs.note) + '</p></div>' +
      '</div>';
    bindSearch();
  }
  function pitchSVG() {
    return '<svg class="hero-pitch" viewBox="0 0 420 280" fill="none" stroke="#fff" stroke-width="2.5" aria-hidden="true">' +
      '<rect x="4" y="4" width="412" height="272" rx="4"/><line x1="210" y1="4" x2="210" y2="276"/><circle cx="210" cy="140" r="44"/><circle cx="210" cy="140" r="3" fill="#fff"/>' +
      '<rect x="4" y="68" width="66" height="144"/><rect x="4" y="106" width="24" height="68"/><rect x="350" y="68" width="66" height="144"/><rect x="392" y="106" width="24" height="68"/>' +
      '<path d="M70 110a36 36 0 0 1 0 60M350 110a36 36 0 0 0 0 60"/></svg>';
  }
  function bindSearch() {
    var inp = document.getElementById('hs'), res = document.getElementById('hr'), hits = [], kb = 0;
    function position() {
      var b = inp.getBoundingClientRect();
      res.style.left = b.left + 'px';
      res.style.top = (b.bottom + 8) + 'px';
      res.style.width = b.width + 'px';
    }
    function render() {
      var q = inp.value.trim().toLowerCase();
      if (!q) { res.classList.remove('open'); return; }
      position();
      hits = S.index.filter(function (e) { return e.label.toLowerCase().indexOf(q) !== -1; })
        .sort(function (a, b) { return (a.label.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (b.label.toLowerCase().indexOf(q) === 0 ? 0 : 1); }).slice(0, 12);
      kb = 0;
      res.innerHTML = hits.length ? hits.map(function (h, i) {
        return '<a href="' + h.href + '" class="' + (i === kb ? 'kb' : '') + '">' + esc(h.label) + '<span class="tag">' + h.type + '</span></a>';
      }).join('') : '<div class="search-empty">No country or competition matches “' + esc(inp.value) + '”.</div>';
      res.classList.add('open');
    }
    inp.addEventListener('input', render);
    inp.addEventListener('keydown', function (e) {
      if (!hits.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); kb = (kb + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
        res.querySelectorAll('a').forEach(function (a, i) { a.classList.toggle('kb', i === kb); });
      } else if (e.key === 'Enter') { location.hash = hits[kb].href; }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) res.classList.remove('open'); });
    window.addEventListener('resize', function () { if (res.classList.contains('open')) position(); });
    window.addEventListener('scroll', function () { if (res.classList.contains('open')) position(); }, true);
  }

  /* ---------------- guide ---------------- */
  function pageGuide(p, app) {
    var g = S.g;
    function row(label, meaning, code) {
      return '<tr><td><span class="pill sm">' + esc(label) + '</span></td><td>' + esc(meaning) + (code ? ' <code class="code">' + esc(code) + '</code>' : '') + '</td></tr>';
    }
    var cond = Object.keys(g.letterCodes).map(function (k) {
      var d = g.letterCodes[k];
      return row(d.short.replace('{N}', 'N'), d.long.replace('{N}', 'N') + (d.scope ? ' ' + d.scope : ''), k === 'C' ? 'C' : k + '#');
    }).join('') + Object.keys(g.coverageWords).map(function (k) { return row(g.coverageWords[k].short, g.coverageWords[k].long, k); }).join('');
    var rounds = Object.keys(g.roundCodes).map(function (k) { return row(g.roundCodes[k].short, g.roundCodes[k].name, k); }).join('');
    app.innerHTML =
      '<div class="eyebrow">Guide</div><h1 class="page-title">How it works</h1>' +
      '<p class="page-lede">Every competition has up to three tiers. Each tier lists the kinds of match that qualify for it. Hover any condition on the site to see the exact rule and the code used in the data files.</p>' +
      '<div class="two-col" style="margin-bottom:16px">' +
      '<div class="panel"><h3>The tiers</h3><ul class="legend-list">' + g.tiers.map(function (t) { return '<li><span class="tier ' + t.key + '">' + t.name + '</span><span class="note">' + esc(t.blurb) + '</span></li>'; }).join('') + '</ul><p class="fine">' + esc(g.separator) + '</p></div>' +
      '<div class="panel"><h3>How rankings are read</h3><ol class="steps">' + g.rankingMethodology.map(function (s) { return '<li><span>' + esc(s) + '</span></li>'; }).join('') + '</ol></div>' +
      '</div>' +
      '<div class="guide-grid">' +
      '<div class="panel"><h3>Conditions</h3><table class="guide-table"><thead><tr><th>Shown as</th><th>Meaning</th></tr></thead><tbody>' + cond + '</tbody></table></div>' +
      '<div class="panel"><h3>Rounds (knockout stages)</h3><table class="guide-table"><thead><tr><th>Shown as</th><th>Meaning</th></tr></thead><tbody>' + rounds + '</tbody></table>' +
      '<p class="fine">A round means that round and every one after it.</p></div>' +
      '</div>' +
      '<div class="section-head"><h2>Global cutoffs</h2></div><div class="panel"><div class="cutoff-list">' +
      ['domestic', 'continental', 'international'].map(function (k) {
        return '<div class="cutoff-row"><span class="lbl">' + SECTIONS[k].title + '</span><div>' + g.globalCutoffs[k].map(function (c) { return '<div style="margin-bottom:4px"><strong>' + esc(c.short) + '</strong> <span class="muted">— ' + esc(c.long) + '</span></div>'; }).join('') + '</div></div>';
      }).join('') + '</div><p class="fine">' + esc(g.globalCutoffs.note) + '</p></div>';
  }

  /* ---------------- router ---------------- */
  var routes = [
    [/^\/$/, pageHome],
    [/^\/(domestic|continental|international)$/, function (m, app) { pageList(m[1], app); }],
    [/^\/domestic\/([^/]+)$/, function (m, app) { pageDomestic({ slug: m[1] }, app); }],
    [/^\/(continental|international)\/([^/]+)$/, function (m, app) { pageComp(m[1], { slug: m[2] }, app); }],
    [/^\/(guide|glossary)$/, pageGuide]
  ];
  var lastPath = null;
  function dispatch() {
    var path = (location.hash.replace(/^#/, '') || '/').split('?')[0].replace(/(.)\/$/, '$1');
    var app = document.getElementById('app');
    var sec = path.split('/')[1] || '';
    if (sec === 'glossary') sec = 'guide';
    document.querySelectorAll('.main-nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-nav') === sec); });
    for (var i = 0; i < routes.length; i++) {
      var m = path.match(routes[i][0]);
      if (m) {
        try { routes[i][1](m, app); } catch (e) { console.error(e); app.innerHTML = '<p class="empty-note">Something went wrong rendering this page.</p>'; }
        if (path !== lastPath) window.scrollTo(0, 0);
        lastPath = path;
        document.title = (app.querySelector('h1') ? app.querySelector('h1').textContent.replace(/\s+/g, ' ') + ' · ' : '') + 'Subscription Criteria';
        if (path === '/') document.title = 'Subscription Criteria';
        return;
      }
    }
    app.innerHTML = '<h1 class="page-title">Not found</h1><p class="page-lede"><a href="#/">Go home</a></p>';
  }

  /* ---------------- boot ---------------- */
  function loadVersion(id) {
    var b = 'data/' + id + '/';
    return Promise.all([csv(b + 'domestic.csv'), csv(b + 'continental.csv'), csv(b + 'international.csv')]).then(function (r) {
      S.version = id; S.domestic = r[0]; S.continental = r[1]; S.international = r[2];
      S.domestic.slice().sort(function (a, b) { return (num(b.average_market_value) || 0) - (num(a.average_market_value) || 0); })
        .forEach(function (x, i) { x._mvRank = i + 1; });
      S.index = [].concat(
        S.domestic.map(function (x) { return { label: x.country, type: 'Domestic', href: '#/domestic/' + slug(x.country) }; }),
        S.continental.map(function (x) { return { label: x.competition, type: 'Continental', href: '#/continental/' + slug(x.competition) }; }),
        S.international.map(function (x) { return { label: x.competition, type: 'International', href: '#/international/' + slug(x.competition) }; })
      );
      document.getElementById('footer-note').textContent = 'Showing the ' + versionLabel(id) + ' standard · updated every March and September · market values in euros (Transfermarkt).';
    });
  }
  function boot() {
    Promise.all([
      get('data/versions.json', true), get('data/glossary.json', true),
      csv('data/history/domestic_market_value.csv').catch(function () { return []; })
    ]).then(function (r) {
      S.versions = r[0]; S.g = r[1]; S.domHist = r[2];
      var sel = document.getElementById('version-select');
      sel.innerHTML = S.versions.map(function (v) { return '<option value="' + v.id + '">' + esc(v.label) + '</option>'; }).join('');
      var cur = S.versions.find(function (v) { return v.status === 'current'; }) || S.versions[S.versions.length - 1];
      sel.value = cur.id;
      sel.addEventListener('change', function () { loadVersion(sel.value).then(dispatch); });
      return loadVersion(cur.id);
    }).then(dispatch).catch(function (e) {
      console.error(e);
      document.getElementById('app').innerHTML = '<p class="empty-note">Couldn\'t load the criteria data. If you opened index.html directly from disk, serve the folder over http instead (GitHub Pages does this for you).</p>';
    });
  }
  window.addEventListener('hashchange', dispatch);
  document.addEventListener('DOMContentLoaded', boot);
})();
