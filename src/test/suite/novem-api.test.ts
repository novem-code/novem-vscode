import * as assert from 'assert';
import NovemApi, { VIS_TYPE_PREFIX } from '../../novem-api';

// Captured outgoing requests for the active fake fetch.
interface CapturedCall {
    url: string;
    method?: string;
    body?: unknown;
}

let calls: CapturedCall[];
let originalFetch: typeof globalThis.fetch;

function installFakeFetch(jsonValue: unknown = []) {
    calls = [];
    originalFetch = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (
        url: string,
        opts: { method?: string; body?: unknown } = {},
    ) => {
        calls.push({ url, method: opts.method, body: opts.body });
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => jsonValue,
            text: async () =>
                typeof jsonValue === 'string' ? jsonValue : JSON.stringify(jsonValue),
        } as unknown as Response;
    };
}

function restoreFetch() {
    (globalThis as { fetch: typeof globalThis.fetch }).fetch = originalFetch;
}

const API_ROOT = 'https://api.test.com/v1';

suite('VIS_TYPE_PREFIX includes grids and docs', () => {
    test('grids maps to /vis/grids', () => {
        assert.strictEqual(VIS_TYPE_PREFIX.grids, '/vis/grids');
    });
    test('docs maps to /vis/docs', () => {
        assert.strictEqual(VIS_TYPE_PREFIX.docs, '/vis/docs');
    });
    test('plots and mails are unchanged', () => {
        assert.strictEqual(VIS_TYPE_PREFIX.plots, '/vis/plots');
        assert.strictEqual(VIS_TYPE_PREFIX.mails, '/vis/mails');
    });
});

suite('NovemApi grid/doc endpoints', () => {
    let api: NovemApi;

    setup(() => {
        installFakeFetch([]);
        api = new NovemApi(API_ROOT, 'test-token');
    });
    teardown(() => restoreFetch());

    test('getGridsForUser hits /u/<user>/g', async () => {
        await api.getGridsForUser('sen');
        assert.strictEqual(calls[0].url, `${API_ROOT}/u/sen/g`);
        assert.strictEqual(calls[0].method, 'GET');
    });

    test('getDocsForUser hits /u/<user>/d', async () => {
        await api.getDocsForUser('sen');
        assert.strictEqual(calls[0].url, `${API_ROOT}/u/sen/d`);
        assert.strictEqual(calls[0].method, 'GET');
    });

    test('getDetailsForVis builds grid/doc paths (with and without subpath)', async () => {
        await api.getDetailsForVis('grids', 'mygrid');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/grids/mygrid`);

        await api.getDetailsForVis('docs', 'mydoc', 'config');
        assert.strictEqual(calls[1].url, `${API_ROOT}/vis/docs/mydoc/config`);
    });

    test('createGrid / createDoc PUT to the right path', async () => {
        await api.createGrid('g1');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/grids/g1`);
        assert.strictEqual(calls[0].method, 'PUT');

        await api.createDoc('d1');
        assert.strictEqual(calls[1].url, `${API_ROOT}/vis/docs/d1`);
        assert.strictEqual(calls[1].method, 'PUT');
    });

    test('deleteGrid / deleteDoc DELETE the right path', async () => {
        await api.deleteGrid('g1');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/grids/g1`);
        assert.strictEqual(calls[0].method, 'DELETE');

        await api.deleteDoc('d1');
        assert.strictEqual(calls[1].url, `${API_ROOT}/vis/docs/d1`);
        assert.strictEqual(calls[1].method, 'DELETE');
    });

    test('readFile resolves the grid/doc prefix', async () => {
        installFakeFetch('file-contents');
        await api.readFile('grids', '/mygrid/config/custom/custom.js');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/grids/mygrid/config/custom/custom.js`);
    });

    test('writeFile POSTs to the doc prefix', async () => {
        await api.writeFile('docs', '/mydoc/content', 'hello');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/docs/mydoc/content`);
        assert.strictEqual(calls[0].method, 'POST');
        assert.strictEqual(calls[0].body, 'hello');
    });
});
