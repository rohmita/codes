// Builds two single-file apps from src/:
//   index.html                         — PRD layout: three@0.160.0 via CDN importmap + Google Fonts
//   tessellalock-studio-offline.html   — everything inlined (three.js, addons, fonts), works without network
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const tpl = readFileSync('src/template.html', 'utf8');
const esc = js => js.replace(/<\/script/gi, '<\\/script');
const put = (html, marker, text) => html.replace(marker, () => text);

// 1) CDN build — keep 'three' and 'three/addons/*' as bare imports for the importmap
const cdn = await build({ entryPoints: ['src/app.js'], bundle: true, format: 'esm', write: false, target: 'es2020',
  external: ['three', 'three/addons/*'], legalComments: 'none' });
const fontsCdn = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">`;
const importmap = `<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>`;
let html = put(tpl, '<!--FONTS-->', fontsCdn);
html = put(html, '<!--IMPORTMAP-->', importmap);
html = put(html, '<!--APP-->', `<script type="module">\n${esc(cdn.outputFiles[0].text)}</script>`);
writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');

// 2) Offline build — bundle three + addons, inline WOFF2 fonts
const off = await build({ entryPoints: ['src/app.js'], bundle: true, format: 'esm', write: false, target: 'es2020', minify: true, legalComments: 'none' });
const fonts = [
  ['Bricolage Grotesque', 500, 'bricolage-grotesque/files/bricolage-grotesque-latin-500-normal.woff2'],
  ['Bricolage Grotesque', 700, 'bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2'],
  ['IBM Plex Sans', 400, 'ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'],
  ['IBM Plex Sans', 500, 'ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2'],
  ['IBM Plex Sans', 600, 'ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'],
  ['IBM Plex Mono', 400, 'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'],
  ['IBM Plex Mono', 500, 'ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'],
].map(([fam, w, f]) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${readFileSync('node_modules/@fontsource/' + f).toString('base64')}) format("woff2")}`).join('\n');
let h2 = put(tpl, '<!--FONTS-->', `<style>\n${fonts}\n</style>`);
h2 = put(h2, '<!--IMPORTMAP-->', '');
h2 = put(h2, '<!--APP-->', `<script type="module">${esc(off.outputFiles[0].text)}</script>`);
writeFileSync('tessellalock-studio-offline.html', h2);
console.log('tessellalock-studio-offline.html', (h2.length / 1024).toFixed(0) + ' KB');
