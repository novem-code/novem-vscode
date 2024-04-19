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
