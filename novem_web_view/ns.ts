import { useEffect } from 'react';

import { ViewData } from './types';

// NS LIBRARY INTEGRATION
//
// All four vis types (plot/mail/grid/doc) render through the same external
// `ns.js` library loaded from https://novem.io/s/ns.js (see index.html). This
// module centralises the integration: one robust loader, one register path,
// and the per-vis theming used by the preview chrome.

export type NsType = 'p' | 'm' | 'g' | 'd';

/** Per-vis colour scheme chosen from the chrome toggle. */
export type VisThemeMode = 'light' | 'system' | 'dark';

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
 * loaded. We poll on the animation frame until `ns` appears, mirroring
 * gaia/webapp's `ensureNsJs`, instead of silently skipping the render.
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
 * Read the current editor colour scheme from the webview body class. VSCode
 * applies exactly one of vscode-light / vscode-dark / vscode-high-contrast /
 * vscode-high-contrast-light to <body> and keeps it in sync with the active
 * editor theme.
 */
export function getCurrentTheme(): 'light' | 'dark' {
    const cls = document.body.className;
    if (cls.includes('vscode-high-contrast-light')) return 'light';
    if (cls.includes('vscode-dark') || cls.includes('vscode-high-contrast')) return 'dark';
    return 'light';
}

/** Resolve a per-vis mode to an effective scheme, following the editor for 'system'. */
export function effectiveTheme(mode: VisThemeMode): 'light' | 'dark' {
    return mode === 'system' ? getCurrentTheme() : mode;
}

/** Next mode in the light → system → dark → light cycle (matches gaia). */
export function nextThemeMode(mode: VisThemeMode): VisThemeMode {
    return mode === 'light' ? 'system' : mode === 'system' ? 'dark' : 'light';
}

/**
 * Apply a colour scheme to the rendered visualisation. vislib reads
 * `data-dark-mode` on the document element via CSS (and custom plots observe
 * it to re-theme their iframe), so toggling this re-themes the vis live with no
 * re-register. We propagate to any iframes ns.js created as well.
 */
export function applyDarkMode(isDark: boolean) {
    const root = document.documentElement;
    if (isDark) root.setAttribute('data-dark-mode', '');
    else root.removeAttribute('data-dark-mode');

    for (const iframe of Array.from(document.getElementsByTagName('iframe'))) {
        try {
            const d = iframe.contentDocument?.documentElement;
            if (!d) continue;
            if (isDark) d.setAttribute('data-dark-mode', '');
            else d.removeAttribute('data-dark-mode');
        } catch {
            // cross-origin iframe — ignore
        }
    }
}

/** The scheme currently applied to the document (what vislib reads). */
export function getAppliedTheme(): 'light' | 'dark' {
    return document.documentElement.hasAttribute('data-dark-mode') ? 'dark' : 'light';
}

/**
 * Drive the rendered vis from a per-vis theme mode. Applies `data-dark-mode`
 * immediately and, while on 'system', tracks the editor theme so a workbench
 * light/dark switch flows through. Re-themes happen via CSS — no re-register
 * (which would make grids vanish / docs re-append pages).
 */
export function useVisTheme(mode: VisThemeMode) {
    useEffect(() => {
        applyDarkMode(effectiveTheme(mode) === 'dark');
        if (mode !== 'system') return;

        const observer = new MutationObserver(() => applyDarkMode(getCurrentTheme() === 'dark'));
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, [mode]);
}

/**
 * Load ns.js and register the visualisation into `targetId`. Re-registers when
 * `refreshKey` changes (the chrome refresh button), clearing the target first
 * so vislib draws fresh instead of stacking (custom plots / doc pages append).
 *
 * The `ns-config-theme` hint is set from the already-applied document theme
 * (useVisTheme runs first within the frame). Docs are excluded: vislib reads a
 * doc's own theme from its config, and forcing light/dark leaves it unstyled.
 */
export function useNsRegistration(
    type: NsType,
    viewData: ViewData,
    targetId: string,
    refreshKey = 0,
) {
    const { shortname, token, apiRoot } = viewData;

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
            if (el) {
                el.innerHTML = '';
                if (type !== 'd') {
                    el.setAttribute('ns-config-theme', getAppliedTheme());
                }
            }

            ns.register(type, shortname, targetId);
            registered = true;

            // Make sure any iframe ns.js just created picks up the theme.
            applyDarkMode(getAppliedTheme() === 'dark');
        });

        return () => {
            cancelled = true;
            if (registered) {
                window.ns?.unregister?.(shortname, targetId);
            }
        };
    }, [type, shortname, token, apiRoot, targetId, refreshKey]);
}
