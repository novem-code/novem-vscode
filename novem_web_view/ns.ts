import { useEffect, useState } from 'react';

import { ViewData } from './types';

// NS LIBRARY INTEGRATION
//
// All four vis types (plot/mail/grid/doc) render through the same external
// `ns.js` library. This module centralises the integration: one robust loader,
// one register path, and the per-vis theming used by the preview chrome.
//
// The library is fetched from the *configured* deployment's asset host rather
// than a hardcoded novem.io, so an api_root pointing at a dev or self-hosted
// novem gets that deployment's vislib. Loading prod's bundle against another
// api silently caps the preview at whatever prod supports — a plot type the
// target deployment renders fine then fails with "Preview not available for
// type ...", because the *library*, not the api, is behind.

export type NsType = 'p' | 'm' | 'g' | 'd';

/** Per-vis colour scheme chosen from the chrome toggle. */
export type VisThemeMode = 'light' | 'system' | 'dark';

/** Give up on a stalled ns.js fetch rather than spinning forever. */
const NS_LOAD_TIMEOUT_MS = 15000;

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
 * Split an api root into the two origins ns.js needs: the api itself, and the
 * apex that serves static assets (`api.example.com` -> `example.com`).
 *
 * Throws if `apiRoot` isn't a valid URL — callers surface that to the user
 * instead of falling back to a different deployment's host.
 */
export function resolveNsHosts(apiRoot: string): { apiUrl: string; assetUrl: string } {
    const apiUrl = new URL(apiRoot).origin;
    // Assets are served from the apex domain, not the api.* subdomain.
    const assetUrl = apiUrl.replace('://api.', '://');
    return { apiUrl, assetUrl };
}

/**
 * Load `ns.js` from `assetUrl` and resolve once `window.ns` exists.
 *
 * The script is injected here rather than sitting in index.html because the
 * host isn't known until the extension posts its `navigate` message with the
 * user's api root. Failure is reported: a 404, an offline host or a bundle
 * that loads without defining `ns` rejects instead of parking the preview on
 * the loading skeleton with nothing in the UI to explain it.
 */
let nsPromise: Promise<void> | null = null;
export function ensureNsJs(assetUrl: string): Promise<void> {
    if (window.ns) return Promise.resolve();
    if (nsPromise) return nsPromise;

    const src = `${assetUrl}/s/ns.js`;

    nsPromise = new Promise<void>((resolve, reject) => {
        let settled = false;

        const finish = (err?: Error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            if (!err) {
                resolve();
                return;
            }
            // Clear the cache so a refresh retries rather than replaying the
            // same rejection for the life of the panel.
            nsPromise = null;
            reject(err);
        };

        const timer = window.setTimeout(
            () => finish(new Error(`Timed out loading the novem library from ${src}`)),
            NS_LOAD_TIMEOUT_MS,
        );

        // ns.js assigns window.ns as it executes, but poll for it instead of
        // trusting load ordering — bounded by the timeout above, so a bundle
        // that never defines `ns` fails loudly rather than hanging.
        const poll = () => {
            if (settled) return;
            if (window.ns) {
                finish();
                return;
            }
            requestAnimationFrame(poll);
        };

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onerror = () => finish(new Error(`Could not load the novem library from ${src}`));
        document.head.appendChild(script);
        poll();
    });

    return nsPromise;
}

/** Point ns.js at the API/asset hosts and hand it the bearer token. */
function setupNs(token: string, apiUrl: string, assetUrl: string) {
    const ns = window.ns;
    if (!ns) return;

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
 *
 * Returns a message describing why the library could not be loaded, or null
 * while things are fine — the caller renders it in place of the empty target.
 */
export function useNsRegistration(
    type: NsType,
    viewData: ViewData,
    targetId: string,
    refreshKey = 0,
): string | null {
    const { shortname, token, apiRoot } = viewData;
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!shortname || !token || !apiRoot) return;

        let hosts: { apiUrl: string; assetUrl: string };
        try {
            hosts = resolveNsHosts(apiRoot);
        } catch {
            setError(`Invalid api root "${apiRoot}"`);
            return;
        }

        let cancelled = false;
        let registered = false;
        setError(null);

        void ensureNsJs(hosts.assetUrl)
            .then(() => {
                if (cancelled) return;
                const ns = window.ns;
                if (!ns) return;

                setupNs(token, hosts.apiUrl, hosts.assetUrl);

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
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                console.error('Error loading ns.js:', e);
                setError(e instanceof Error ? e.message : String(e));
            });

        return () => {
            cancelled = true;
            if (registered) {
                window.ns?.unregister?.(shortname, targetId);
            }
        };
    }, [type, shortname, token, apiRoot, targetId, refreshKey]);

    return error;
}
