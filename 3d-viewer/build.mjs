// Builds a single self-contained index.html (engine, three.js, app and fonts inlined).
// Usage: npm install && npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true,
  write: false, target: 'es2022', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const fonts = [
  ['Manrope', 400, 'manrope/files/manrope-latin-400-normal.woff2'],
  ['Manrope', 600, 'manrope/files/manrope-latin-600-normal.woff2'],
  ['Manrope', 700, 'manrope/files/manrope-latin-700-normal.woff2'],
  ['Manrope', 800, 'manrope/files/manrope-latin-800-normal.woff2'],
  ['JetBrains Mono', 400, 'jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'],
  ['JetBrains Mono', 600, 'jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2'],
].map(([fam, w, f]) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${readFileSync('node_modules/@fontsource/' + f).toString('base64')}) format("woff2")}`).join('\n');

const html = readFileSync('src/template.html', 'utf8')
  .replace('/*__FONTS__*/', () => fonts)
  .replace('/*__APP__*/', () => js);
writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
