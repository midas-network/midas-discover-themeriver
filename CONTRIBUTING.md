# Contributing to MIDAS ThemeRiver

Thanks for your interest in improving the project! This guide covers local
setup, the most common contribution (adding a dataset), and conventions.

## Development setup

```bash
npm install
npm start        # http://localhost:8001, regenerates the manifest on boot
```

There is no build/bundling step. Edit `index.template.html`, `css/themeriver.css`,
or `js/main.js` and refresh the browser.

> Edit `index.template.html`, **not** `index.html` — the latter is generated.
> Run `bash ../scripts/stamp-themeriver-year.sh` (from the repo root) or restart
> `npm start` to regenerate it.

## Adding or updating a dataset

Datasets are discovered from files on disk; no code changes are required.

1. Add `data/<source>-ngram_<n>-counts.csv` and
   `data/<source>-ngram_<n>-papers.json`. The formats are documented in
   [docs/DATA.md](docs/DATA.md).
2. Optionally add a label / order / default in `datasets.config.json`.
3. Regenerate the manifest: `node scripts/build-manifest.js data`.
4. Reload and confirm the new control appears and renders.

Please keep the two files consistent: every `(year, topic)` with a non-zero
count in the CSV should have corresponding papers in the JSON.

## Code conventions

- Match the existing style (indentation, naming) of the file you edit.
- Keep it dependency-light and framework-free; this is intentionally a static app.
- CSS: put new rules in the "Modern redesign" section at the end of
  `css/themeriver.css` and prefer the existing CSS custom properties
  (`--accent`, `--ink`, `--muted`, …) over hard-coded colors.
- Preserve accessibility: keep controls keyboard-operable, label interactive
  elements, and provide meaningful `alt` text on images.

## Submitting changes

1. Fork and create a feature branch.
2. Make your change and test it locally in the browser (desktop and a narrow
   viewport).
3. Open a pull request describing the change and how you verified it.

## Reporting issues

Open a GitHub issue with steps to reproduce, or email
<questions@midasnetwork.us>.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
