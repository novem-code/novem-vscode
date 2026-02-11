const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function build() {
  const ctx = await esbuild.context({
    entryPoints: ['./novem_web_view/index.tsx'],
    bundle: true,
    outfile: './dist/novem_web_view/bundle.js',
    platform: 'browser',
    format: 'iife',
    sourcemap: !production,
    minify: production,
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.css': 'css',
    },
    define: {
      'global': 'window',
    },
    logLevel: 'info',
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }

  // Copy and update HTML file to dist
  const distDir = path.resolve(__dirname, '../dist/novem_web_view');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  let htmlContent = fs.readFileSync(
    path.resolve(__dirname, 'index.html'),
    'utf-8'
  );
  
  // Inject CSS and JS references before closing body tag
  const cssLink = '<link rel="stylesheet" href="bundle.css">';
  const jsScript = '<script src="bundle.js"></script>';
  htmlContent = htmlContent.replace(
    '</body>',
    `  ${cssLink}\n  ${jsScript}\n  </body>`
  );
  
  fs.writeFileSync(
    path.resolve(distDir, 'index.html'),
    htmlContent
  );
  
  console.log('Build complete!');
}

build().catch(() => process.exit(1));
