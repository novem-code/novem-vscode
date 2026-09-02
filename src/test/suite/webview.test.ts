import * as assert from 'assert';
import { avatarStyle } from '../../../novem_web_view/utils';
import { getCurrentTheme, resolveNsHosts } from '../../../novem_web_view/ns';

suite('avatarStyle (avatar URL fix)', () => {
    test('uses the avatar URL verbatim — no size suffix', () => {
        const style = avatarStyle('https://api.novem.io/v1/u/sen/img');
        assert.strictEqual(style.backgroundImage, 'url(https://api.novem.io/v1/u/sen/img)');
    });

    test('never appends the malformed "&s=" that 404d the avatar endpoint', () => {
        const style = avatarStyle('https://api.novem.io/v1/u/sen/img');
        assert.ok(!String(style.backgroundImage).includes('&s='));
    });

    test('returns an empty style when no avatar is set', () => {
        assert.deepStrictEqual(avatarStyle(undefined), {});
        assert.deepStrictEqual(avatarStyle(''), {});
    });
});

suite('getCurrentTheme (editor theme matching)', () => {
    const g = global as unknown as { document?: { body: { className: string } } };
    let savedDoc: { body: { className: string } } | undefined;

    setup(() => {
        savedDoc = g.document;
    });
    teardown(() => {
        g.document = savedDoc;
    });

    const withBodyClass = (className: string) => {
        g.document = { body: { className } };
    };

    test('vscode-dark → dark', () => {
        withBodyClass('vscode-dark');
        assert.strictEqual(getCurrentTheme(), 'dark');
    });

    test('vscode-light → light', () => {
        withBodyClass('vscode-light');
        assert.strictEqual(getCurrentTheme(), 'light');
    });

    test('vscode-high-contrast → dark', () => {
        withBodyClass('vscode-high-contrast');
        assert.strictEqual(getCurrentTheme(), 'dark');
    });

    test('vscode-high-contrast-light → light', () => {
        withBodyClass('vscode-high-contrast-light');
        assert.strictEqual(getCurrentTheme(), 'light');
    });
});

suite('resolveNsHosts (ns.js follows the configured deployment)', () => {
    test('api.* is stripped to the apex asset host', () => {
        const { apiUrl, assetUrl } = resolveNsHosts('https://api.novem.io/v1/');
        assert.strictEqual(apiUrl, 'https://api.novem.io');
        assert.strictEqual(assetUrl, 'https://novem.io');
    });

    test('a dev api root resolves to the dev asset host, not novem.io', () => {
        // The whole point of the fix: pointing api_root at another deployment
        // must load that deployment's vislib. Loading prod's bundle instead
        // caps the preview at whatever prod's vislib supports.
        const { apiUrl, assetUrl } = resolveNsHosts('https://api.neuf.dev/v1/');
        assert.strictEqual(apiUrl, 'https://api.neuf.dev');
        assert.strictEqual(assetUrl, 'https://neuf.dev');
    });

    test('a host without an api. prefix is left alone', () => {
        const { apiUrl, assetUrl } = resolveNsHosts('https://novem.example.com/v1/');
        assert.strictEqual(apiUrl, 'https://novem.example.com');
        assert.strictEqual(assetUrl, 'https://novem.example.com');
    });

    test('only the leading api. label is rewritten', () => {
        const { assetUrl } = resolveNsHosts('https://api.internal.example.com/v1/');
        assert.strictEqual(assetUrl, 'https://internal.example.com');
    });

    test('a non-http port and path are dropped — origin only', () => {
        const { apiUrl, assetUrl } = resolveNsHosts('http://localhost:8080/v1/');
        assert.strictEqual(apiUrl, 'http://localhost:8080');
        assert.strictEqual(assetUrl, 'http://localhost:8080');
    });

    test('throws on a malformed api root rather than guessing a host', () => {
        assert.throws(() => resolveNsHosts('not-a-url'));
    });
});
