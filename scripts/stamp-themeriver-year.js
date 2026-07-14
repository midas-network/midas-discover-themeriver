#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildManifest } = require('./build-manifest');

const APP_ROOT = path.join(__dirname, '..');

function stampThemeriverYear(options = {}) {
  const appRoot = options.appRoot || APP_ROOT;
  const dataDir = options.dataDir || path.join(appRoot, 'data');
  const configPath = options.configPath || path.join(appRoot, 'datasets.config.json');
  const templatePath = options.templatePath || path.join(appRoot, 'index.template.html');
  const outPath = options.outPath || path.join(appRoot, 'index.html');
  const buildVersion = encodeURIComponent(String(
    options.buildVersion ||
    process.env.BUILD_VERSION ||
    process.env.COMMIT_SHA ||
    Date.now()
  ));

  const manifest = buildManifest(dataDir, configPath);
  const year = manifest.maxYear;
  if (!year) {
    throw new Error(`No data years found in ${dataDir}`);
  }

  const template = fs.readFileSync(templatePath, 'utf8');
  const stamped = template
    .replace(/END_YEAR/g, String(year))
    .replace(/BUILD_VERSION/g, buildVersion);
  fs.writeFileSync(outPath, stamped);

  return { outPath, year, buildVersion };
}

module.exports = { stampThemeriverYear };

if (require.main === module) {
  const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(APP_ROOT, 'data');
  const { outPath, year, buildVersion } = stampThemeriverYear({ dataDir });
  console.log(`Stamped ${outPath} with year ${year} and build ${buildVersion}`);
}
