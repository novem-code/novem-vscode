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

function waitForTreeRefresh(provider: BaseNovemProvider): Promise<void> {
    return new Promise(resolve => {
        const disposable = provider.onDidChangeTreeData(() => {
            disposable.dispose();
            resolve();
        });
    });
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
    test('shows a loading node before replacing it with cached root items', async () => {
        const pendingRoots = deferred<any[]>();
        const provider = new TestTreeProvider(fakeContext('alice'), pendingRoots.promise);

        const refresh = waitForTreeRefresh(provider);
        const loadingChildren = (await provider.getChildren())!;
        await Promise.resolve();

        assert.strictEqual(provider.rootCalls, 1);
        assert.strictEqual(provider.lastUsername, 'alice');
        assert.deepStrictEqual(loadingChildren.map(labelOf), ['Loading...']);

        pendingRoots.resolve([{ id: 'z-plot' }, { id: 'a-plot' }]);
        await refresh;

        const children = (await provider.getChildren())!;

        assert.deepStrictEqual(children.map(labelOf), ['a-plot', 'z-plot', 'Create New Plot...']);
        assert.ok(!children.some(item => labelOf(item) === 'Loading...'));
        assert.strictEqual(provider.rootCalls, 1);
    });

    test('coalesces concurrent root requests', async () => {
        const pendingRoots = deferred<any[]>();
        const provider = new TestTreeProvider(fakeContext('alice'), pendingRoots.promise);

        const refresh = waitForTreeRefresh(provider);
        const first = (await provider.getChildren())!;
        const second = (await provider.getChildren())!;
        await Promise.resolve();

        assert.deepStrictEqual(first.map(labelOf), ['Loading...']);
        assert.deepStrictEqual(second.map(labelOf), ['Loading...']);
        assert.strictEqual(provider.rootCalls, 1);

        pendingRoots.resolve([{ id: 'plot' }]);
        await refresh;
        const firstChildren = (await provider.getChildren())!;
        const secondChildren = (await provider.getChildren())!;

        assert.deepStrictEqual(firstChildren.map(labelOf), ['plot', 'Create New Plot...']);
        assert.deepStrictEqual(secondChildren.map(labelOf), ['plot', 'Create New Plot...']);
        assert.strictEqual(provider.rootCalls, 1);
    });
});
