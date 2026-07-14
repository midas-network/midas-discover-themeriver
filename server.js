const express = require('express');
const fs = require('fs');
const path = require('path');
const { writeManifest } = require('./scripts/build-manifest');

const app = express();
const PORT = process.env.PORT || 8001;
const DATA_DIR = path.join(__dirname, 'data');

// Regenerate data/manifest.json from whatever files are currently in data/ so
// local dev always reflects the datasets on disk. In production the manifest is
// generated at build time (see scripts/build-manifest.js) and served statically.
try {
  const { outPath, manifest } = writeManifest(DATA_DIR);
  console.log(`Manifest: ${manifest.datasets.length} dataset(s) → ${path.basename(outPath)}`);
} catch (err) {
  console.error('Failed to generate manifest:', err.message);
}

// Derive the year range by scanning all counts CSVs in the data directory.
// Returns { minYear, maxYear } based on the union of all dates found.
function getYearRange() {
  let years = new Set();
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('-counts.csv'));
    for (const file of files) {
      const lines = fs.readFileSync(path.join(DATA_DIR, file), 'utf8').split('\n');
      for (const line of lines.slice(1)) {
        const date = line.split(',')[0];
        if (date && date !== 'date' && /^\d{4}/.test(date)) {
          years.add(parseInt(date.substring(0, 4), 10));
        }
      }
    }
  } catch (err) {
    console.error('Error reading data files:', err.message);
  }
  if (years.size === 0) return { minYear: null, maxYear: null };
  return { minYear: Math.min(...years), maxYear: Math.max(...years) };
}

// Serve year range so the client can render accurate titles without hardcoding.
app.get('/api/year-range', (req, res) => {
  res.json(getYearRange());
});

// Serve all other static assets.
app.use(express.static(__dirname));

app.listen(PORT, () => {
  const { minYear, maxYear } = getYearRange();
  console.log(`MIDAS River  →  http://localhost:${PORT}`);
  console.log(`Data range detected: ${minYear}–${maxYear}`);
});
