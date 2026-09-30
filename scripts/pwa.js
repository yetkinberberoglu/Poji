/**
 * Runs after `expo export`.
 * Copies the PWA files into dist/ and injects the manifest tags
 * plus the service-worker registration into index.html.
 */
const fs = require('fs');
const path = require('path');

const DIST   = path.join(__dirname, '..', 'dist');
const PUBLIC = path.join(__dirname, '..', 'public');

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `npx expo export --platform web` first.');
  process.exit(1);
}

// 1. copy static assets
const copy = [
  'manifest.json', 'sw.js',
  'icon-192.png', 'icon-512.png',
  'icon-maskable-192.png', 'icon-maskable-512.png',
  'favicon.png', 'apple-touch-icon.png',
];
copy.forEach(f => {
  const src = path.join(PUBLIC, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f));
});

// 2. inject into index.html
const indexPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const headFile = path.join(PUBLIC, 'index-head.html');
const head = fs.existsSync(headFile)
  ? fs.readFileSync(headFile, 'utf8').split('\n').filter(l => !l.trim().startsWith('<!--')).join('\n')
  : '<link rel="manifest" href="/manifest.json">\n<meta name="theme-color" content="#4F46E5">';

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', head + '\n</head>');
}

const swScript = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (e) {
      console.log('SW registration failed:', e);
    });
  });
}
</script>`;

if (!html.includes("serviceWorker.register")) {
  html = html.replace('</body>', swScript + '\n</body>');
}

fs.writeFileSync(indexPath, html);
console.log('✅ PWA files copied and index.html patched');
