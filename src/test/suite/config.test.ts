import * as assert from 'assert';
import { parseConfig, typeToIcon } from '../../config';

const miniConfig = `
[general]
profile=p1
api_root=https://api.example.com/v1/

[profile:p1]
username=p1
token_name=token-name
token=nbt-p1
`;

const mediumConfig = `
[general]
profile=p1
api_root=https://api.example.com/v1/

[profile:p1]
username=p1
api_root=https://api.foobar.com/v1/
token=nbt-p1
`;

const fullConfig = `
[general]
profile=p1
api_root=https://api.example.com/v1/

[app:vscode]
profile=p2

[profile:p1]
username=p1
api_root=https://api.foobar.com/v1/
token=nbt-p1

[profile:p2]
username=p2
token=nbt-p2
`;

suite('config', () => {
    test('can read api_root ', () => {
        const config = parseConfig(miniConfig);
        assert.strictEqual(config.api_root, 'https://api.example.com/v1/');
    });

    test('can follow [profile] from general', () => {
        const config = parseConfig(miniConfig);
        assert.strictEqual(config.token, 'nbt-p1');
    });

    test('api_root from [profile] takes presedence over [general] ', () => {
        const config = parseConfig(mediumConfig);
        assert.strictEqual(config.api_root, 'https://api.foobar.com/v1/');
    });

    test('[app] profile takes presedence over [general]', () => {
        const config = parseConfig(fullConfig);
        assert.strictEqual(config.token, 'nbt-p2');
        assert.strictEqual(config.api_root, 'https://api.example.com/v1/');
    });
});

suite('typeToIcon', () => {
    test('returns "mail" for mails type', () => {
        assert.strictEqual(typeToIcon('any', 'mails'), 'mail');
    });

    test('returns "graph" for all plot types', () => {
        // Test various chart types - all should return 'graph'
        assert.strictEqual(typeToIcon('bar'), 'graph');
        assert.strictEqual(typeToIcon('line'), 'graph');
        assert.strictEqual(typeToIcon('pie'), 'graph');
        assert.strictEqual(typeToIcon('table'), 'graph');
        assert.strictEqual(typeToIcon('scatter'), 'graph');
        assert.strictEqual(typeToIcon('text'), 'graph');
        assert.strictEqual(typeToIcon('unknown'), 'graph');
    });
});
