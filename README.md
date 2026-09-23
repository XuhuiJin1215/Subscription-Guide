# Subscription Criteria

A personal reference site for which football matches are worth subscribing to / watching, based on a
twice-yearly criteria spreadsheet (March & September). No build step, no framework, no backend —
plain HTML/CSS/JS reading CSV/JSON data files, made to run on GitHub Pages.

## Structure

```
index.html          shell page (header, nav, version switcher)
style.css            all styling
app.js               router, data loading, rendering — the whole app
data/
  versions.json       list of available snapshots, which one is "current"
  glossary.json        the code glossary + methodology text shown on the Glossary page
  2026-09/            current snapshot
    domestic.csv        one row per country
    continental.csv      one row per continental competition
    international.csv    one row per international competition
  2026-03/            previous snapshot, same shape
  history/
    domestic_market_value.csv      market-value-only history reconstructed from older files
                                    (2024–2025 snapshots; no per-round criteria, just MV over time)
```

## Adding a new snapshot (e.g. September 2026)

1. Convert the updated spreadsheet into the same three-CSV shape as `data/2026-03/` — same column
   headers, same shorthand codes (`O10`, `S6`, `T3`, `C`, round codes like `F`/`QF`/`R16`, `full`/`top`,
   `/`-separated for OR). The site translates these into plain language — the codes only live in the CSVs. Put them in a new folder, e.g. `data/2026-09/`.
2. Add an entry to `data/versions.json`:
   ```json
   { "id": "2026-09", "label": "September 2026", "status": "current" }
   ```
   and change the old entry's `"status"` from `"current"` to something else (e.g. remove the key, or
   set `"status": "archived"` — the app only checks for the literal value `"current"`).
3. If any new shorthand codes are introduced, add them to `data/glossary.json` (`letterCodes`,
   `roundCodes`, or `coverageWords`) with a `short` label (shown on the pill) and a longer meaning.
   Unknown codes still display, just as the raw code.
4. Commit and push — GitHub Pages picks it up automatically, nothing to rebuild.

The version dropdown in the header will then show both snapshots; switching versions reloads the
three data files for that snapshot without a page refresh.

## Hosting on GitHub Pages

This is a static site — no build step. Push this folder to a GitHub repo and enable Pages
(Settings → Pages → Deploy from a branch → `main`, folder `/`). No workflow file needed.

## Notes on the data

- The March 2026 criteria file is the first snapshot with full Important/Main/Supplementary rules;
  `data/history/domestic_market_value.csv` only carries market-value figures reconstructed from
  differently-formatted older files (2024–2025), used for the small trend chart on country pages.
  There's no historical criteria data before March 2026. Market-value history is no longer tracked
  for continental or international competitions.
- The global cutoffs are shown as a separate route in ("Also counts if"), not tied to a specific tier.
