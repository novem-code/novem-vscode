export const enforceStyles = () => {
    const isDark = document.body.classList.contains('vscode-dark');

    // localStorage.setItem('theme', isDark ? 'dark' : 'light');

    const iframes = document.getElementsByTagName('iframe');
    for (const iframe of iframes) {
        let elem = iframe.contentDocument?.documentElement;
        try {
            if (isDark) {
                elem?.setAttribute('data-dark-mode', '');
            } else {
                elem?.removeAttribute('data-dark-mode');
            }
        } catch (e) {}
    }
};

export function writeCSP() {
    const str =
        'connect-src https://www.gravatar.com ' +
        [
            ['novem.io', true],
            ['neuf.run', false],
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
