// Builds a single, fully offline index.html: three.js, exporters and fonts are all inlined.
// Usage: npm install && npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/app.js'], bundle: true, format: 'esm', minify: true,
  write: false, target: 'es2020', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const fonts = [
  ['Bricolage Grotesque', 500, 'bricolage-grotesque/files/bricolage-grotesque-latin-500-normal.woff2'],
  ['Bricolage Grotesque', 700, 'bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2'],
  ['IBM Plex Sans', 400, 'ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'],
  ['IBM Plex Sans', 500, 'ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2'],
  ['IBM Plex Sans', 600, 'ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'],
  ['IBM Plex Mono', 400, 'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 500, 'ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'],
].map(([fam, w, f]) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${readFileSync('node_modules/@fontsource/' + f).toString('base64')}) format("woff2")}`).join('\n');

const html = readFileSync('src/template.html', 'utf8')
  .replace('/*__FONTS__*/', () => fonts)
  .replace('/*__APP__*/', () => js);
writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
