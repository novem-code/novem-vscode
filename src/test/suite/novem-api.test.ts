import * as assert from 'assert';
import NovemApi, { VIS_TYPE_PREFIX } from '../../novem-api';

// Captured outgoing requests for the active fake fetch.
interface CapturedCall {
    url: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
}

let calls: CapturedCall[];
let originalFetch: typeof globalThis.fetch;

function installFakeFetch(jsonValue: unknown = []) {
    calls = [];
    originalFetch = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (
        url: string,
        opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    ) => {
        calls.push({ url, method: opts.method, body: opts.body, headers: opts.headers });
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

// Mutating endpoints often respond with HTTP 2xx and an empty body. The
// makeRequest helper used to JSON.parse('') and throw; we now treat empty
// bodies as "no payload". This helper lets tests reproduce that response.
function installEmptyBodyFetch() {
    calls = [];
    originalFetch = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (
        url: string,
        opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
    ) => {
        calls.push({ url, method: opts.method, body: opts.body, headers: opts.headers });
        return {
            ok: true,
            status: 204,
            statusText: 'No Content',
            json: async () => {
                throw new SyntaxError('Unexpected end of JSON input');
            },
            text: async () => '',
        } as unknown as Response;
    };
}

function restoreFetch() {
    (globalThis as { fetch: typeof globalThis.fetch }).fetch = originalFetch;
}

// Route responses per URL (for tests mixing GraphQL /gql and REST endpoints).
function installRoutedFetch(route: (url: string, body: string) => unknown) {
    calls = [];
    originalFetch = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (
        url: string,
        opts: { method?: string; body?: string } = {},
    ) => {
        calls.push({ url, method: opts.method, body: opts.body });
        const jsonValue = route(url, opts.body ?? '');
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => jsonValue,
            text: async () => JSON.stringify(jsonValue),
        } as unknown as Response;
    };
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

    test('deleteResource DELETEs grids and docs at the right path', async () => {
        await api.deleteResource('grids', 'g1');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/grids/g1`);
        assert.strictEqual(calls[0].method, 'DELETE');

        await api.deleteResource('docs', 'd1');
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

suite('NovemApi GraphQL aggregate', () => {
    teardown(() => restoreFetch());

    const meResponse = () => ({
        data: {
            me: {
                plots: [{ id: 'p1', name: 'P1', url: 'https://novem.io/p/x', type: 'bar' }],
                mails: [],
                grids: [{ id: 'g1', name: null, url: 'https://novem.io/g/y', type: 'dashboard' }],
                docs: [],
                jobs: [],
                repos: [],
            },
        },
    });

    test('getSelfVis POSTs a me{} query to <origin>/gql (not /v1)', async () => {
        installRoutedFetch(() => meResponse());
        const api = new NovemApi(API_ROOT, 'tok');
        const agg = await api.getSelfVis('sen');

        assert.strictEqual(calls[0].url, 'https://api.test.com/gql');
        assert.strictEqual(calls[0].method, 'POST');
        assert.ok(String(calls[0].body).includes('me {'), 'query targets me');
        assert.strictEqual(agg.plots.length, 1);
        assert.deepStrictEqual(agg.mails, []);
        assert.deepStrictEqual(agg.grids.length, 1);
    });

    test('normalizes url -> uri and guarantees arrays', async () => {
        installRoutedFetch(() => meResponse());
        const api = new NovemApi(API_ROOT, 'tok');
        const agg = await api.getSelfVis('sen');

        assert.strictEqual(agg.plots[0].uri, 'https://novem.io/p/x');
        assert.strictEqual(agg.grids[0].uri, 'https://novem.io/g/y');
        for (const key of ['plots', 'mails', 'grids', 'docs', 'jobs', 'repos'] as const) {
            assert.ok(Array.isArray(agg[key]), `${key} is an array`);
        }
    });

    test('getSelfVis memoizes — repeated calls share one request', async () => {
        installRoutedFetch(() => meResponse());
        const api = new NovemApi(API_ROOT, 'tok');
        await api.getSelfVis('sen');
        await api.getSelfVis('sen');
        assert.strictEqual(calls.length, 1);
    });

    test('invalidateVisCache forces a refetch', async () => {
        installRoutedFetch(() => meResponse());
        const api = new NovemApi(API_ROOT, 'tok');
        await api.getSelfVis('sen');
        api.invalidateVisCache();
        await api.getSelfVis('sen');
        assert.strictEqual(calls.length, 2);
    });

    test('getUserVis queries users(username:) with a variable', async () => {
        installRoutedFetch(() => ({
            data: {
                users: [
                    { plots: [{ id: 'q' }], mails: [], grids: [], docs: [], jobs: [], repos: [] },
                ],
            },
        }));
        const api = new NovemApi(API_ROOT, 'tok');
        const agg = await api.getUserVis('bob');

        assert.strictEqual(calls[0].url, 'https://api.test.com/gql');
        const body = JSON.parse(String(calls[0].body));
        assert.ok(body.query.includes('users(username'), 'query targets users()');
        assert.strictEqual(body.variables.u, 'bob');
        assert.strictEqual(agg.plots[0].id, 'q');
    });

    test('falls back to REST list endpoints when GraphQL errors', async () => {
        installRoutedFetch(url => {
            if (url.endsWith('/gql')) return { errors: [{ message: 'boom' }] };
            return []; // REST list endpoints return empty arrays
        });
        const api = new NovemApi(API_ROOT, 'tok');
        const agg = await api.getSelfVis('sen');

        assert.ok(
            calls.some(c => c.url.endsWith('/gql')),
            'attempted GraphQL first',
        );
        assert.ok(
            calls.some(c => c.url === `${API_ROOT}/u/sen/p`),
            'fell back to REST /u/sen/p',
        );
        assert.deepStrictEqual(agg.plots, []);
    });
});

suite('NovemApi resource-action endpoints', () => {
    let api: NovemApi;

    setup(() => {
        installFakeFetch([]);
        api = new NovemApi(API_ROOT, 'test-token');
    });
    teardown(() => restoreFetch());

    // Walk every visType so a future addition (or removal) to VIS_TYPE_PREFIX
    // can't quietly skip a type. Each pair drives one rename + one delete call.
    const visTypes: Array<[string, string]> = [
        ['plots', '/vis/plots'],
        ['mails', '/vis/mails'],
        ['grids', '/vis/grids'],
        ['docs', '/vis/docs'],
        ['jobs', '/code/jobs'],
        ['repos', '/code/repos'],
    ];

    for (const [visType, prefix] of visTypes) {
        test(`renameResource PATCHes ${visType} as text/plain`, async () => {
            await api.renameResource(visType, 'old_id', 'new_id');
            assert.strictEqual(calls[0].url, `${API_ROOT}${prefix}/old_id`);
            assert.strictEqual(calls[0].method, 'PATCH');
            assert.strictEqual(calls[0].body, 'new_id');
            assert.strictEqual(calls[0].headers?.['Content-Type'], 'text/plain');
        });

        test(`deleteResource DELETEs ${visType}/<id>`, async () => {
            await api.deleteResource(visType, 'x');
            assert.strictEqual(calls[0].url, `${API_ROOT}${prefix}/x`);
            assert.strictEqual(calls[0].method, 'DELETE');
        });
    }

    test('sendMail POSTs /status=sending', async () => {
        await api.sendMail('demo');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/mails/demo/status`);
        assert.strictEqual(calls[0].method, 'POST');
        assert.strictEqual(calls[0].body, 'sending');
        assert.strictEqual(calls[0].headers?.['Content-Type'], 'text/plain');
    });

    test('testMail POSTs /status=testing', async () => {
        await api.testMail('demo');
        assert.strictEqual(calls[0].url, `${API_ROOT}/vis/mails/demo/status`);
        assert.strictEqual(calls[0].method, 'POST');
        assert.strictEqual(calls[0].body, 'testing');
        assert.strictEqual(calls[0].headers?.['Content-Type'], 'text/plain');
    });

    test('runJob POSTs /data with an empty JSON body', async () => {
        await api.runJob('my_job');
        assert.strictEqual(calls[0].url, `${API_ROOT}/code/jobs/my_job/data`);
        assert.strictEqual(calls[0].method, 'POST');
        assert.strictEqual(calls[0].body, '{}');
        assert.strictEqual(calls[0].headers?.['Content-Type'], 'application/json');
    });
});

suite('NovemApi empty-body tolerance', () => {
    // Regression: PATCH and POST against the Novem API often return HTTP 2xx
    // with an empty body. makeRequest used to JSON.parse('') and throw
    // "Unexpected end of JSON input"; it should now resolve to undefined.
    teardown(() => restoreFetch());

    test('rename succeeds when the server returns an empty 2xx body', async () => {
        installEmptyBodyFetch();
        const api = new NovemApi(API_ROOT, 'tok');
        const result = await api.renameResource('mails', 'old', 'new');
        assert.strictEqual(result, undefined);
    });

    test('sendMail succeeds when the server returns an empty 2xx body', async () => {
        installEmptyBodyFetch();
        const api = new NovemApi(API_ROOT, 'tok');
        const result = await api.sendMail('demo');
        assert.strictEqual(result, undefined);
    });
});
