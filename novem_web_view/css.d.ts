// esbuild bundles the webview's stylesheets at build time (see esbuild.config.js);
// tsc only needs to know that these side-effect imports resolve to something.
// TypeScript 6 made an undeclared side-effect import an error (TS2882) where
// earlier versions ignored it, which broke `tsc -p ./` on the three
// `import './x.css'` sites in this directory.
declare module '*.css';
