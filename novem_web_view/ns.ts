import { useEffect, useState } from 'react';

import { ViewData } from './types';
import { enforceStyles } from './utils';

// NS LIBRARY INTEGRATION
//
// All four vis types (plot/mail/grid/doc) render through the same external
// `ns.js` library loaded from https://novem.io/s/ns.js (see index.html). This
// module centralises the integration so every component shares one robust
// loader, one register/unregister path, and one theme story.

export type NsType = 'p' | 'm' | 'g' | 'd';

interface NSFunctions {
    setup: (config: { bearerToken?: string; apiUrl?: string; assetUrl?: string }) => void;
    register: (type: string, shortname: string, targetId: string) => void;
    unregister?: (shortname: string, targetId: string) => void;
}

declare global {
    interface Window {
        ns?: NSFunctions;
    }
}

/**
 * Resolve once `window.ns` is available.
 *
 * The `<script src=".../ns.js">` tag lives in index.html, but the bundle may
 * finish executing (and this effect may fire) before the external script has
 * loaded. The previous implementation guarded with `if (window.ns?.setup)` and
 * silently skipped the render on a cold load. We instead poll on the animation
 * frame until `ns` appears, mirroring gaia/webapp's `ensureNsJs`.
 */
let nsPromise: Promise<void> | null = null;
export function ensureNsJs(): Promise<void> {
    if (window.ns) return Promise.resolve();
    if (nsPromise) return nsPromise;

    nsPromise = new Promise<void>(resolve => {
        const poll = () => {
            if (window.ns) {
                resolve();
                return;
            }
            requestAnimationFrame(poll);
        };
        poll();
    });
    return nsPromise;
}

/** Point ns.js at the API/asset hosts and hand it the bearer token. */
function setupNs(token: string, apiRoot: string) {
    const ns = window.ns;
    if (!ns) return;

    const apiUrl = new URL(apiRoot).origin;
    // Assets are served from the apex domain, not the api.* subdomain.
    const assetUrl = apiUrl.replace('://api.', '://');

    ns.setup({ bearerToken: token, apiUrl, assetUrl });
}

/**
 * Read the current colour scheme from the webview body class. VSCode applies
 * exactly one of vscode-light / vscode-dark / vscode-high-contrast /
 * vscode-high-contrast-light to <body> and keeps it in sync with the active
 * editor theme.
 */
export function getCurrentTheme(): 'light' | 'dark' {
    const cls = document.body.className;
    if (cls.includes('vscode-high-contrast-light')) return 'light';
    if (cls.includes('vscode-dark') || cls.includes('vscode-high-contrast')) return 'dark';
    return 'light';
}

/** Track the active VSCode theme, updating when the user switches themes. */
function useVscodeTheme(): 'light' | 'dark' {
    const [theme, setTheme] = useState<'light' | 'dark'>(getCurrentTheme);

    useEffect(() => {
        const update = () => setTheme(getCurrentTheme());
        const observer = new MutationObserver(update);
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        });
        update();
        return () => observer.disconnect();
    }, []);

    return theme;
}

/**
 * Load ns.js, register the visualisation into `targetId`, and re-register
 * whenever the editor theme changes so the rendered vis tracks light/dark.
 *
 * Docs are deliberately excluded from the `ns-config-theme` hint: vislib reads
 * a doc's own theme (built-in / +org / custom) from its config, and forcing
 * "light"/"dark" would clobber it and leave the doc unstyled (see gaia
 * webapp usePlotRegistration).
 */
export function useNsRegistration(type: NsType, viewData: ViewData, targetId: string) {
    const { shortname, token, apiRoot } = viewData;
    const theme = useVscodeTheme();

    useEffect(() => {
        if (!shortname || !token || !apiRoot) return;

        let cancelled = false;
        let registered = false;

        void ensureNsJs().then(() => {
            if (cancelled) return;
            const ns = window.ns;
            if (!ns) return;

            setupNs(token, apiRoot);

            const el = document.getElementById(targetId);
            if (el && type !== 'd') {
                el.setAttribute('ns-config-theme', theme);
            }

            ns.register(type, shortname, targetId);
            registered = true;

            // Apply dark-mode attributes to any iframes ns.js just created.
            enforceStyles();
        });

        return () => {
            cancelled = true;
            // Drop the registration so in-flight render callbacks don't draw
            // into a detached node, and so the theme re-register starts clean.
            if (registered) {
                window.ns?.unregister?.(shortname, targetId);
            }
        };
    }, [type, shortname, token, apiRoot, targetId, theme]);
}
