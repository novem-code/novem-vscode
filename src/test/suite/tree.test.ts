import * as assert from 'assert';
import * as vscode from 'vscode';

import NovemApi from '../../novem-api';
import { BaseNovemProvider } from '../../tree';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(r => {
        resolve = r;
    });
    return { promise, resolve };
}

function fakeContext(username: string): vscode.ExtensionContext {
    return {
        globalState: {
            get: (key: string) => (key === 'userProfile' ? { user_info: { username } } : undefined),
        },
    } as unknown as vscode.ExtensionContext;
}

function labelOf(item: vscode.TreeItem): string {
    const label = item.label;
    return typeof label === 'string' ? label : (label?.label ?? '');
}

class TestTreeProvider extends BaseNovemProvider {
    rootCalls = 0;
    lastUsername: string | undefined;

    constructor(
        context: vscode.ExtensionContext,
        private readonly roots: any[] | Promise<any[]>,
    ) {
        super({ invalidateVisCache: () => undefined } as unknown as NovemApi, context);
    }

    getType() {
        return 'plots' as const;
    }

    async getRootItems(username: string) {
        this.rootCalls++;
        this.lastUsername = username;
        return this.roots;
    }

    async getChildItems() {
        return [];
    }
}

suite('BaseNovemProvider root loading', () => {
    test('first root request resolves real items instead of a synthetic loading node', async () => {
        const pendingRoots = deferred<any[]>();
        const provider = new TestTreeProvider(fakeContext('alice'), pendingRoots.promise);

        const childrenPromise = provider.getChildren();
        await Promise.resolve();

        assert.strictEqual(provider.rootCalls, 1);
        assert.strictEqual(provider.lastUsername, 'alice');

        pendingRoots.resolve([{ id: 'z-plot' }, { id: 'a-plot' }]);
        const children = await childrenPromise;

        assert.deepStrictEqual(children.map(labelOf), ['a-plot', 'z-plot', 'Create New Plot...']);
        assert.ok(!children.some(item => labelOf(item) === 'Loading...'));
    });

    test('coalesces concurrent root requests', async () => {
        const pendingRoots = deferred<any[]>();
        const provider = new TestTreeProvider(fakeContext('alice'), pendingRoots.promise);

        const first = provider.getChildren();
        const second = provider.getChildren();
        await Promise.resolve();

        assert.strictEqual(provider.rootCalls, 1);

        pendingRoots.resolve([{ id: 'plot' }]);
        const [firstChildren, secondChildren] = await Promise.all([first, second]);

        assert.deepStrictEqual(firstChildren.map(labelOf), ['plot', 'Create New Plot...']);
        assert.deepStrictEqual(secondChildren.map(labelOf), ['plot', 'Create New Plot...']);
        assert.strictEqual(provider.rootCalls, 1);
    });
});
