import * as assert from 'assert';
import { avatarStyle } from '../../../novem_web_view/utils';
import { getCurrentTheme } from '../../../novem_web_view/ns';

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
