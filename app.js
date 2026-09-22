/* Subscription Criteria site
 * Vanilla JS, hash-routed, CSV/JSON data loaded via fetch. No build step, no dependencies.
 */
(function () {
  'use strict';

  var state = {
    version: null,
    versions: [],
    glossary: null,
    domestic: [],
    continental: [],
    international: [],
    domesticHistory: [],
    continentalHistory: [],
    searchIndex: []
  };

  // ---------------------------------------------------------------------
  // CSV parsing (handles quoted fields, embedded commas/newlines/quotes)
  // ---------------------------------------------------------------------
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { row.push(field); field = ''; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += c; i++; continue;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
    return rows;
  }

  function csvToObjects(text) {
    var rows = parseCSV(text);
    if (!rows.length) return [];
    var headers = rows[0];
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row.length || (row.length === 1 && row[0] === '')) continue;
      var obj = {};
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c] !== undefined ? row[c] : '';
      out.push(obj);
    }
    return out;
  }

  function fetchText(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('Failed to load ' + path);
      return r.text();
    });
  }
  function fetchJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('Failed to load ' + path);
      return r.json();
    });
  }
  function fetchCSV(path) {
    return fetchText(path).then(csvToObjects);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function slugify(s) {
    return String(s).toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtMV(v) {
    if (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) return '';
    var n = parseFloat(v);
    return '€' + n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M';
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  // ---------------------------------------------------------------------
  // Glossary-aware code rendering
  // ---------------------------------------------------------------------
  function describeToken(token) {
    token = token.trim();
    if (!token) return null;
    var g = state.glossary;
    if (g.roundCodes[token]) return g.roundCodes[token];
    if (g.coverageWords[token]) return g.coverageWords[token];
    if (token === 'C') return g.letterCodes.C.template;
    var m = token.match(/^([A-Za-z]+)(\d+)$/);
    if (m) {
      var letter = m[1], num = m[2];
      var def = g.letterCodes[letter];
      if (def) return def.template.replace('{N}', num) + (def.scope ? ' (' + def.scope + ')' : '');
    }
    return 'Custom note — see the source sheet.';
  }

  function renderCode(codeStr) {
    if (!codeStr || !codeStr.trim()) return '<span class="none">not tracked</span>';
    var parts = codeStr.split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.map(function (p, idx) {
      var desc = describeToken(p);
      var chip = '<span class="glossary-chip" tabindex="0"><code>' + esc(p) + '</code>' +
        (desc ? '<span class="tip">' + esc(desc) + '</span>' : '') + '</span>';
      return chip;
    }).join('<span class="slash-sep">/</span>');
  }

  function tierRow(label, cls, value) {
    return '<div class="tier-row">' +
      '<div><span class="tier-badge ' + cls + '">' + label + '</span></div>' +
      '<div class="tier-value">' + renderCode(value) + '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------
  var routes = [];
  function route(pattern, handler) {
    var paramNames = [];
    var regex = new RegExp('^' + pattern.replace(/:[^\/]+/g, function (m) {
      paramNames.push(m.slice(1));
      return '([^/]+)';
    }) + '$');
    routes.push({ regex: regex, paramNames: paramNames, handler: handler });
  }

  function dispatch() {
    var hash = location.hash.replace(/^#/, '') || '/';
    var path = hash.split('?')[0];
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    document.querySelectorAll('.main-nav a').forEach(function (a) { a.classList.remove('active'); });
    var app = document.getElementById('app');
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].regex.exec(path);
      if (m) {
        var params = {};
        routes[i].paramNames.forEach(function (name, idx) { params[name] = decodeURIComponent(m[idx + 1]); });
        try {
          routes[i].handler(params, app);
        } catch (e) {
          console.error(e);
          app.innerHTML = '<p class="empty-note">Something went wrong rendering this page.</p>';
        }
        window.scrollTo(0, 0);
        highlightNav(path);
        return;
      }
    }
    app.innerHTML = '<h1 class="page-title">Not found</h1><p class="page-lede">That page doesn\'t exist. <a href="#/">Go home</a>.</p>';
  }

  function highlightNav(path) {
    var section = path.split('/')[1] || '';
    var map = { '': null, all: 'all', domestic: 'domestic', continental: 'continental', international: 'international', glossary: 'glossary' };
    var key = map[section];
    if (key) {
      var a = document.querySelector('.main-nav a[data-nav="' + key + '"]');
      if (a) a.classList.add('active');
    }
  }

  // ---------------------------------------------------------------------
  // Combined search index
  // ---------------------------------------------------------------------
  function buildSearchIndex() {
    var idx = [];
    state.domestic.forEach(function (r) {
      idx.push({ type: 'Domestic', label: r.country, slug: slugify(r.country), path: '#/domestic/' + slugify(r.country) });
    });
    state.continental.forEach(function (r) {
      idx.push({ type: 'Continental', label: r.competition, slug: slugify(r.competition), path: '#/continental/' + slugify(r.competition) });
    });
    state.international.forEach(function (r) {
      idx.push({ type: 'International', label: r.competition, slug: slugify(r.competition), path: '#/international/' + slugify(r.competition) });
    });
    state.searchIndex = idx;
  }

  function searchEntries(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    return state.searchIndex.filter(function (e) { return e.label.toLowerCase().indexOf(q) !== -1; }).slice(0, 20);
  }

  // ---------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------
  function pageHome(params, app) {
    var g = state.glossary;
    app.innerHTML =
      '<h1 class="page-title">Subscription Criteria</h1>' +
      '<p class="page-lede">Personal reference for which football matches are worth subscribing to / watching, updated twice a year (March &amp; September). Search any country or competition, or browse by type below.</p>' +
      '<div class="hero-search">' +
      '<input type="search" id="home-search" placeholder="Search a country or competition…" autocomplete="off">' +
      '<div class="search-results" id="home-search-results"></div>' +
      '</div>' +
      '<div class="nav-cards">' +
      '<a class="nav-card" href="#/domestic"><div class="n">' + state.domestic.length + '</div><div class="l">Domestic countries</div></a>' +
      '<a class="nav-card" href="#/continental"><div class="n">' + state.continental.length + '</div><div class="l">Continental competitions</div></a>' +
      '<a class="nav-card" href="#/international"><div class="n">' + state.international.length + '</div><div class="l">International competitions</div></a>' +
      '<a class="nav-card" href="#/all"><div class="n">All</div><div class="l">Browse the full master list</div></a>' +
      '</div>' +
      '<h2 class="section-title">Global cutoffs (apply on top of everything below)</h2>' +
      '<div class="rules-grid">' +
      rulesCard('Domestic', g.globalCutoffs.domestic) +
      rulesCard('Continental', g.globalCutoffs.continental) +
      rulesCard('International', g.globalCutoffs.international) +
      '</div>' +
      '<p class="empty-note">' + esc(g.globalCutoffs.note) + ' See the <a href="#/glossary">glossary</a> for the full code reference and ranking methodology.</p>';

    var input = document.getElementById('home-search');
    var results = document.getElementById('home-search-results');
    input.addEventListener('input', function () {
      var matches = searchEntries(input.value);
      if (!input.value.trim()) { results.classList.remove('open'); results.innerHTML = ''; return; }
      if (!matches.length) {
        results.innerHTML = '<div class="search-empty">No matches.</div>';
      } else {
        results.innerHTML = matches.map(function (m) {
          return '<a href="' + m.path + '">' + esc(m.label) + '<span class="type-tag">' + m.type + '</span></a>';
        }).join('');
      }
      results.classList.add('open');
    });
    document.addEventListener('click', function (e) {
      if (!results.contains(e.target) && e.target !== input) results.classList.remove('open');
    });
  }

  function rulesCard(title, lines) {
    return '<div class="rules-panel"><h3>' + esc(title) + '</h3><ul>' +
      lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') +
      '</ul></div>';
  }

  function summarizeTierPair(important, main) {
    var imp = important && important.trim() ? renderCode(important) : '<span class="tier-dash">—</span>';
    var mn = main && main.trim() ? renderCode(main) : '<span class="tier-dash">—</span>';
    return '<div class="tier-code"><strong>I:</strong> ' + imp + '</div><div class="tier-code"><strong>M:</strong> ' + mn + '</div>';
  }

  function pageAll(params, app) {
    var combined = [];
    state.domestic.forEach(function (r) {
      combined.push({
        type: 'Domestic', name: r.country, confed: r.confederation,
        important: r.top_tier_important, main: r.top_tier_main,
        mv: r.average_market_value, link: '#/domestic/' + slugify(r.country)
      });
    });
    state.continental.forEach(function (r) {
      combined.push({
        type: 'Continental', name: r.competition, confed: r.confederation,
        important: r.important, main: r.main,
        mv: '', link: '#/continental/' + slugify(r.competition)
      });
    });
    state.international.forEach(function (r) {
      combined.push({
        type: 'International', name: r.competition, confed: r.confederation,
        important: r.important, main: r.main,
        mv: '', link: '#/international/' + slugify(r.competition)
      });
    });
    renderMasterTable(app, 'All entries', 'Every country and competition across the three sheets, in one place.', combined, true);
  }

  function pageDomesticList(params, app) {
    var rows = state.domestic.map(function (r) {
      return {
        type: 'Domestic', name: r.country, confed: r.confederation,
        important: r.top_tier_important, main: r.top_tier_main,
        mv: r.average_market_value, link: '#/domestic/' + slugify(r.country)
      };
    });
    renderMasterTable(app, 'Domestic', 'One row per country. Important / Main columns show the Top-Tier league rule — open a country for the full breakdown (second tier, cups, etc).', rows, false);
  }

  function pageContinentalList(params, app) {
    var rows = state.continental.map(function (r) {
      return {
        type: 'Continental', name: r.competition, confed: r.confederation,
        important: r.important, main: r.main, mv: '', link: '#/continental/' + slugify(r.competition)
      };
    });
    renderMasterTable(app, 'Continental', 'Club competitions between teams from different domestic leagues.', rows, false);
  }

  function pageInternationalList(params, app) {
    var rows = state.international.map(function (r) {
      return {
        type: 'International', name: r.competition, confed: r.confederation,
        important: r.important, main: r.main, mv: '', link: '#/international/' + slugify(r.competition)
      };
    });
    renderMasterTable(app, 'International', 'National-team competitions.', rows, false);
  }

  function renderMasterTable(app, title, lede, rows, showType) {
    var wrap = el(
      '<div>' +
      '<h1 class="page-title">' + esc(title) + '</h1>' +
      '<p class="page-lede">' + esc(lede) + '</p>' +
      '<div class="table-toolbar">' +
      '<input type="search" id="filter-input" placeholder="Filter by name…">' +
      (showType ? '<select id="type-filter"><option value="">All types</option><option value="Domestic">Domestic</option><option value="Continental">Continental</option><option value="International">International</option></select>' : '') +
      '</div>' +
      '<div class="result-count" id="result-count"></div>' +
      '<div class="table-scroll"><table class="data-table"><thead><tr>' +
      (showType ? '<th data-key="type">Type</th>' : '') +
      '<th data-key="name">Name</th>' +
      '<th data-key="confed">Confederation</th>' +
      '<th>Important</th><th>Main</th>' +
      '</tr></thead><tbody id="table-body"></tbody></table></div>' +
      '</div>'
    );
    app.innerHTML = '';
    app.appendChild(wrap);

    var filterInput = document.getElementById('filter-input');
    var typeFilter = document.getElementById('type-filter');
    var tbody = document.getElementById('table-body');
    var countEl = document.getElementById('result-count');
    var sortKey = 'name', sortDir = 1;

    function draw() {
      var q = filterInput.value.trim().toLowerCase();
      var t = typeFilter ? typeFilter.value : '';
      var filtered = rows.filter(function (r) {
        if (t && r.type !== t) return false;
        if (q && r.name.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      filtered.sort(function (a, b) {
        var av = (a[sortKey] || '').toString().toLowerCase();
        var bv = (b[sortKey] || '').toString().toLowerCase();
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
      });
      countEl.textContent = filtered.length + (filtered.length === 1 ? ' entry' : ' entries');
      tbody.innerHTML = filtered.map(function (r) {
        return '<tr>' +
          (showType ? '<td><span class="type-pill">' + esc(r.type) + '</span></td>' : '') +
          '<td><a class="row-link" href="' + r.link + '">' + esc(r.name) + '</a></td>' +
          '<td>' + esc(r.confed || '') + '</td>' +
          '<td>' + (r.important && r.important.trim() ? renderCode(r.important) : '<span class="tier-dash">—</span>') + '</td>' +
          '<td>' + (r.main && r.main.trim() ? renderCode(r.main) : '<span class="tier-dash">—</span>') + '</td>' +
          '</tr>';
      }).join('');
    }

    filterInput.addEventListener('input', draw);
    if (typeFilter) typeFilter.addEventListener('change', draw);
    wrap.querySelectorAll('th[data-key]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-key');
        if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
        draw();
      });
    });
    draw();
  }

  // ---- Detail pages ----
  function pageDomesticDetail(params, app) {
    var row = state.domestic.find(function (r) { return slugify(r.country) === params.slug; });
    if (!row) { app.innerHTML = notFoundBlock('domestic'); return; }
    var html = '<div class="breadcrumb"><a href="#/domestic">Domestic</a> / ' + esc(row.country) + '</div>';
    html += '<div class="detail-header"><h1>' + esc(row.country) + '</h1></div>';
    html += '<div class="detail-meta">' +
      '<span><strong>' + esc(row.confederation) + '</strong></span>' +
      '<span><strong>' + esc(row.teams) + '</strong> top-tier clubs</span>' +
      '<span>Total MV <strong>' + esc(fmtMV(row.total_market_value)) + '</strong></span>' +
      '<span>Average MV <strong>' + esc(fmtMV(row.average_market_value)) + '</strong></span>' +
      '</div>';

    var comps = [
      ['League (Top Tier)', 'top_tier'],
      ['League (Second Tier)', 'second_tier'],
      ['Main Cup', 'main_cup'],
      ['League Cup', 'league_cup'],
      ['Super Cup', 'super_cup'],
      ['State Championship', 'state_championship']
    ];
    comps.forEach(function (c) {
      var imp = row[c[1] + '_important'], main = row[c[1] + '_main'], supp = row[c[1] + '_supplementary'];
      if (!imp && !main && !supp) return; // not applicable to this country
      html += '<div class="comp-card"><h2>' + c[0] + '</h2>' +
        tierRow('Important', 'important', imp) +
        tierRow('Main', 'main', main) +
        tierRow('Supplementary', 'supplementary', supp) +
        '</div>';
    });

    var histBlock = historyBlockDomestic(row.country);
    if (histBlock) html += histBlock;

    app.innerHTML = html;
  }

  function pageCompetitionDetail(kind, params, app) {
    var list = kind === 'continental' ? state.continental : state.international;
    var row = list.find(function (r) { return slugify(r.competition) === params.slug; });
    if (!row) { app.innerHTML = notFoundBlock(kind); return; }
    var label = kind === 'continental' ? 'Continental' : 'International';
    var html = '<div class="breadcrumb"><a href="#/' + kind + '">' + label + '</a> / ' + esc(row.competition) + '</div>';
    html += '<div class="detail-header"><h1>' + esc(row.competition) + '</h1></div>';
    html += '<div class="detail-meta"><span><strong>' + esc(row.confederation) + '</strong></span><span>Priority rank <strong>#' + esc(row.rank) + '</strong></span></div>';
    html += '<div class="comp-card">' +
      tierRow('Important', 'important', row.important) +
      tierRow('Main', 'main', row.main) +
      tierRow('Supplementary', 'supplementary', row.supplementary) +
      '</div>';

    if (kind === 'continental') {
      var histBlock = historyBlockContinental(row.competition);
      if (histBlock) html += histBlock;
    }
    app.innerHTML = html;
  }

  function notFoundBlock(section) {
    return '<h1 class="page-title">Not found</h1><p class="page-lede">Couldn\'t find that entry. <a href="#/' + section + '">Back to ' + section + '</a>.</p>';
  }

  // ---- History mini charts ----
  function historyBlockDomestic(country) {
    var pts = state.domesticHistory.filter(function (r) { return r.country === country && r.tier === '1'; });
    if (!pts.length) return '';
    pts.sort(function (a, b) { return a.snapshot < b.snapshot ? -1 : 1; });
    return '<div class="comp-card"><h2>Average market value over time (top tier)</h2>' +
      lineChart(pts.map(function (p) { return { label: p.snapshot, value: parseFloat(p.average_market_value) }; }), '€ M / team') +
      '</div>';
  }
  function historyBlockContinental(competition) {
    var pts = state.continentalHistory.filter(function (r) { return r.competition === competition; });
    if (!pts.length) return '';
    pts.sort(function (a, b) { return a.snapshot < b.snapshot ? -1 : 1; });
    return '<div class="comp-card"><h2>Average market value over time</h2>' +
      lineChart(pts.map(function (p) { return { label: p.snapshot, value: parseFloat(p.average_market_value) }; }), '€ M / team') +
      '</div>';
  }

  function lineChart(points, unitLabel) {
    if (points.length < 2) {
      return '<p class="empty-note">Only one historical data point (' + esc(points[0].label) + ') — not enough to chart yet.</p>';
    }
    var W = 640, H = 180, padL = 44, padR = 16, padT = 16, padB = 28;
    var vals = points.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min -= 1; max += 1; }
    var range = max - min;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    function x(i) { return padL + (i / (points.length - 1)) * innerW; }
    function y(v) { return padT + innerH - ((v - min) / range) * innerH; }
    var path = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(p.value).toFixed(1); }).join(' ');
    var dots = points.map(function (p, i) {
      var anchor = i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle');
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="3.5" fill="var(--accent)"></circle>' +
        '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="var(--ink-muted)" text-anchor="' + anchor + '">' + esc(p.label) + '</text>';
    }).join('');
    var yTopLabel = max.toFixed(0), yBotLabel = min.toFixed(0);
    var svg = '<div class="history-chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market value trend">' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + innerH) + '" stroke="var(--gridline)" stroke-width="1"></line>' +
      '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (padL + innerW) + '" y2="' + (padT + innerH) + '" stroke="var(--gridline)" stroke-width="1"></line>' +
      '<text x="4" y="' + (padT + 4) + '" font-size="10" fill="var(--ink-muted)">' + esc(yTopLabel) + '</text>' +
      '<text x="4" y="' + (padT + innerH) + '" font-size="10" fill="var(--ink-muted)">' + esc(yBotLabel) + '</text>' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2"></path>' +
      dots +
      '</svg></div><div class="history-legend"><span><span class="dot" style="background:var(--accent)"></span>' + esc(unitLabel) + '</span></div>';
    return svg;
  }

  // ---- Glossary page ----
  function pageGlossary(params, app) {
    var g = state.glossary;
    var html = '<h1 class="page-title">Glossary &amp; methodology</h1>';
    html += '<p class="page-lede">What every shorthand code in the criteria means, and how the ranking-based rules are actually computed through a season.</p>';

    html += '<div class="glossary-block"><h2 class="section-title">Letter codes (with a number)</h2><table class="code-table"><thead><tr><th>Code</th><th>Name</th><th>Meaning</th></tr></thead><tbody>';
    Object.keys(g.letterCodes).forEach(function (k) {
      var d = g.letterCodes[k];
      html += '<tr><td><code>' + esc(k) + 'N</code></td><td>' + esc(d.name) + '</td><td>' + esc(d.template.replace('{N}', 'N')) + (d.scope ? ' <br><span style="color:var(--ink-muted)">' + esc(d.scope) + '</span>' : '') + '</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="glossary-block"><h2 class="section-title">Round codes</h2><table class="code-table"><thead><tr><th>Code</th><th>Meaning</th></tr></thead><tbody>';
    Object.keys(g.roundCodes).forEach(function (k) {
      html += '<tr><td><code>' + esc(k) + '</code></td><td>' + esc(g.roundCodes[k]) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="glossary-block"><h2 class="section-title">Coverage words (Supplementary tier)</h2><table class="code-table"><thead><tr><th>Word</th><th>Meaning</th></tr></thead><tbody>';
    Object.keys(g.coverageWords).forEach(function (k) {
      html += '<tr><td><code>' + esc(k) + '</code></td><td>' + esc(g.coverageWords[k]) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    html += '<div class="glossary-block"><h2 class="section-title">The "/" separator</h2><p>' + esc(g.separator.meaning) + '</p></div>';

    html += '<div class="glossary-block"><h2 class="section-title">Global cutoffs</h2>';
    html += rulesCard('Domestic', g.globalCutoffs.domestic);
    html += rulesCard('Continental', g.globalCutoffs.continental);
    html += rulesCard('International', g.globalCutoffs.international);
    html += '<div class="note-box">' + esc(g.globalCutoffs.note) + '</div></div>';

    html += '<div class="glossary-block"><h2 class="section-title">Ranking methodology</h2><ol class="glossary-list">' +
      g.rankingMethodology.map(function (l) { return '<li style="margin-bottom:8px; color:var(--ink-secondary); font-size:14px;">' + esc(l) + '</li>'; }).join('') +
      '</ol></div>';

    app.innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  route('/', pageHome);
  route('/all', pageAll);
  route('/domestic', pageDomesticList);
  route('/continental', pageContinentalList);
  route('/international', pageInternationalList);
  route('/domestic/:slug', pageDomesticDetail);
  route('/continental/:slug', function (params, app) { pageCompetitionDetail('continental', params, app); });
  route('/international/:slug', function (params, app) { pageCompetitionDetail('international', params, app); });
  route('/glossary', pageGlossary);

  function loadVersion(versionId) {
    var base = 'data/' + versionId + '/';
    return Promise.all([
      fetchCSV(base + 'domestic.csv'),
      fetchCSV(base + 'continental.csv'),
      fetchCSV(base + 'international.csv')
    ]).then(function (results) {
      state.version = versionId;
      state.domestic = results[0];
      state.continental = results[1];
      state.international = results[2];
      buildSearchIndex();
    });
  }

  function boot() {
    Promise.all([
      fetchJSON('data/versions.json'),
      fetchJSON('data/glossary.json'),
      fetchCSV('data/history/domestic_market_value.csv').catch(function () { return []; }),
      fetchCSV('data/history/continental_market_value.csv').catch(function () { return []; })
    ]).then(function (r) {
      state.versions = r[0];
      state.glossary = r[1];
      state.domesticHistory = r[2];
      state.continentalHistory = r[3];

      var select = document.getElementById('version-select');
      select.innerHTML = state.versions.map(function (v) {
        return '<option value="' + v.id + '">' + esc(v.label) + (v.status === 'current' ? ' (current)' : '') + '</option>';
      }).join('');
      var current = state.versions.find(function (v) { return v.status === 'current'; }) || state.versions[0];
      select.value = current.id;
      document.getElementById('footer-version-note').textContent =
        'Showing ' + current.label + '. Criteria updated twice a year (March & September).';

      select.addEventListener('change', function () {
        loadVersion(select.value).then(function () {
          var v = state.versions.find(function (v) { return v.id === select.value; });
          document.getElementById('footer-version-note').textContent = 'Showing ' + v.label + '.';
          dispatch();
        });
      });

      return loadVersion(current.id);
    }).then(dispatch).catch(function (e) {
      console.error(e);
      document.getElementById('app').innerHTML = '<p class="empty-note">Couldn\'t load the criteria data.</p>';
    });
  }

  window.addEventListener('hashchange', dispatch);
  document.addEventListener('DOMContentLoaded', boot);
})();
