import type { CSSProperties } from 'react';

/**
 * Background-image style for a profile avatar.
 *
 * The novem avatar endpoint (e.g. https://api.novem.io/v1/u/<user>/img) returns
 * a ready-to-use image and ignores sizing query params, so we use the URL
 * verbatim — matching how gaia/webapp renders avatars. The previous code
 * appended "&s=160" with no "?", producing a malformed URL that 404'd. Returns
 * an empty style when no avatar is set so the CSS fallback (grey circle) shows
 * instead of url(undefined).
 */
export function avatarStyle(avatarUrl?: string): CSSProperties {
    return avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : {};
}

export function writeCSP() {
    const str =
        'connect-src https://www.gravatar.com ' +
        [
            ['novem.io', true],
            ['neuf.dev', false],
            ['neuf.cloud', true],
        ]
            .map(([domain, ssl]) => {
                const ws = ssl ? 'wss' : 'ws';
                const http = ssl ? 'https' : 'http';
                return `${http}://${domain} ${http}://api.${domain} ${ws}://api.${domain}`;
            })
            .join(' ');

    var tag = document.createElement('meta');
    tag.setAttribute('http-equiv', 'Content-Security-Policy');
    tag.setAttribute('content', str);
    document.head.appendChild(tag);
}
