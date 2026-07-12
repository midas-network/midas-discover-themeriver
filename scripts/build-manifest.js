#!/usr/bin/env node
/**
 * build-manifest.js — generate data/manifest.json for the ThemeRiver app.
 *
 * The app is served as static files (nginx in prod, node/python in dev), so the
 * client cannot list the data directory over HTTP. Instead we scan the data dir
 * at build time and emit a manifest the client fetches to build its controls.
 *
 * Datasets are discovered purely from the files on disk. A file named
 *   <source>-ngram_<n>-counts.csv
 * contributes n-gram size <n> to dataset <source>. Human-readable labels,
 * ordering, and the default selection come from datasets.config.json (optional).
 *
 * Adding a new dataset therefore requires only dropping its files into data/ —
 * no HTML or JS changes. Run this script (or start server.js, which runs it on
 * boot) to regenerate the manifest.
 *
 * Usage: node scripts/build-manifest.js [dataDir] [configPath]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DEFAULT_DATA_DIR = path.join(APP_ROOT, 'data');
const DEFAULT_CONFIG = path.join(APP_ROOT, 'datasets.config.json');

const COUNTS_RE = /^(.+)-ngram_(\d+)-counts\.csv$/;

// Turn a raw source id like "pubmedKeywords" into "Pubmed Keywords".
function prettifyId(id) {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function loadConfig(configPath) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`build-manifest: ignoring unreadable config ${configPath}: ${err.message}`);
    }
    return {};
  }
}

// Union of all years found in the date column of every *-counts.csv.
function getYearRange(dataDir, countsFiles) {
  const years = new Set();
  for (const file of countsFiles) {
    let text;
    try {
      text = fs.readFileSync(path.join(dataDir, file), 'utf8');
    } catch (err) {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const cell = line.split(',')[0];
      const m = cell && cell.match(/^(\d{4})/);
      if (m) years.add(parseInt(m[1], 10));
    }
  }
  if (years.size === 0) return { minYear: null, maxYear: null };
  return { minYear: Math.min(...years), maxYear: Math.max(...years) };
}

function buildManifest(dataDir = DEFAULT_DATA_DIR, configPath = DEFAULT_CONFIG) {
  const config = loadConfig(configPath);
  const sourceCfg = config.sources || {};
  const ngramLabels = config.ngramLabels || { 1: 'Unigrams', 2: 'Bigrams', 3: 'Trigrams' };

  let files = [];
  try {
    files = fs.readdirSync(dataDir);
  } catch (err) {
    console.warn(`build-manifest: cannot read data dir ${dataDir}: ${err.message}`);
  }
  const countsFiles = files.filter((f) => COUNTS_RE.test(f));

  // Group n-gram sizes by source id.
  const bySource = new Map();
  for (const file of countsFiles) {
    const [, id, ngramStr] = file.match(COUNTS_RE);
    const ngram = parseInt(ngramStr, 10);
    if (!bySource.has(id)) bySource.set(id, new Set());
    bySource.get(id).add(ngram);
  }

  const datasets = [...bySource.entries()].map(([id, ngramSet]) => {
    const cfg = sourceCfg[id] || {};
    const ngrams = [...ngramSet].sort((a, b) => a - b);
    return {
      id,
      label: cfg.label || prettifyId(id),
      ngrams,
      supportsNgrams: ngrams.length > 1,
      default: cfg.default === true,
      order: typeof cfg.order === 'number' ? cfg.order : 999,
    };
  });

  // Stable order: configured order first, then alphabetical by label.
  datasets.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  // Guarantee exactly one default (config's, else the first dataset).
  if (datasets.length && !datasets.some((d) => d.default)) {
    datasets[0].default = true;
  }
  datasets.forEach((d) => delete d.order);

  const { minYear, maxYear } = getYearRange(dataDir, countsFiles);
  const meta = config.meta || {};

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    title: meta.title || 'MIDAS ThemeRiver',
    description: meta.description || '',
    homepage: meta.homepage || '',
    license: meta.license || 'MIT',
    dataLicense: meta.dataLicense || 'CC-BY-4.0',
    minYear,
    maxYear,
    ngramLabels,
    datasets,
  };
}

function writeManifest(dataDir = DEFAULT_DATA_DIR, configPath = DEFAULT_CONFIG) {
  const manifest = buildManifest(dataDir, configPath);
  const outPath = path.join(dataDir, 'manifest.json');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  return { manifest, outPath };
}

module.exports = { buildManifest, writeManifest, prettifyId };

// Run as a CLI: node scripts/build-manifest.js [dataDir] [configPath]
if (require.main === module) {
  const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DATA_DIR;
  const configPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_CONFIG;
  const { manifest, outPath } = writeManifest(dataDir, configPath);
  const ids = manifest.datasets.map((d) => d.id).join(', ');
  console.log(`Wrote ${outPath}`);
  console.log(`  datasets: ${ids || '(none)'}`);
  console.log(`  years:    ${manifest.minYear}–${manifest.maxYear}`);
}
