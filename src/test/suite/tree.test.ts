import * as assert from 'assert';
import * as vscode from 'vscode';

import NovemApi from '../../novem-api';
import { BaseNovemProvider, MyTreeItem, NovemResourcesProvider, VisType } from '../../tree';

const ALL_TYPES: VisType[] = ['plots', 'mails', 'grids', 'docs', 'jobs', 'repos'];

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

function fakeTreeView() {
    const revealed: vscode.TreeItem[] = [];
    const onCollapse: ((event: { element: vscode.TreeItem }) => void)[] = [];
    const view = {
        reveal: async (item: vscode.TreeItem) => {
            revealed.push(item);
        },
        onDidCollapseElement: (handler: (event: { element: vscode.TreeItem }) => void) => {
            onCollapse.push(handler);
            return { dispose: () => undefined };
        },
    } as unknown as vscode.TreeView<vscode.TreeItem>;

    return {
        view,
        revealed,
        collapse: (element: vscode.TreeItem) => onCollapse.forEach(handler => handler({ element })),
    };
}

function labelOf(item: vscode.TreeItem): string {
    const label = item.label;
    return typeof label === 'string' ? label : (label?.label ?? '');
}

async function waitFor(check: () => boolean, what: string): Promise<void> {
    for (let attempt = 0; attempt < 100 && !check(); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.ok(check(), what);
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
        private roots: any[] | Promise<any[]>,
        private readonly type: VisType = 'plots',
    ) {
        super({ invalidateVisCache: () => undefined } as unknown as NovemApi, context);
    }

    setRoots(roots: any[]) {
        this.roots = roots;
    }

    getType() {
        return this.type;
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
        assert.strictEqual(provider.rootResourceCount(), null);

        pendingRoots.resolve([{ id: 'z-plot' }, { id: 'a-plot' }]);
        await refresh;

        const children = (await provider.getChildren())!;

        assert.deepStrictEqual(children.map(labelOf), ['a-plot', 'z-plot']);
        assert.strictEqual(provider.rootResourceCount(), 2);
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

        assert.deepStrictEqual(firstChildren.map(labelOf), ['plot']);
        assert.deepStrictEqual(secondChildren.map(labelOf), ['plot']);
        assert.strictEqual(provider.rootCalls, 1);
    });

    test('offers a call to action when the user has none of this type', async () => {
        const provider = new TestTreeProvider(fakeContext('alice'), []);

        const refresh = waitForTreeRefresh(provider);
        await provider.getChildren();
        await refresh;

        const children = (await provider.getChildren())!;

        assert.deepStrictEqual(children.map(labelOf), ['Create Your First Plot']);
        assert.strictEqual(children[0].command?.command, 'novem.createNovemPlot');
        assert.strictEqual(provider.rootResourceCount(), 0);
    });
});

suite('NovemResourcesProvider sections', () => {
    async function loadSections(roots: Partial<Record<VisType, any[]>>) {
        const providers = {} as Record<VisType, TestTreeProvider>;
        for (const type of ALL_TYPES) {
            providers[type] = new TestTreeProvider(fakeContext('alice'), roots[type] ?? [], type);
        }
        const resources = new NovemResourcesProvider(providers);

        const settled = Promise.all(ALL_TYPES.map(type => waitForTreeRefresh(providers[type])));
        const loading = await resources.getChildren();
        await settled;

        return { providers, resources, loading, sections: await resources.getChildren() };
    }

    const stateOf = (sections: vscode.TreeItem[]) =>
        sections.map(section => section.collapsibleState);

    test('holds the tree back until every resource count is in', async () => {
        const { loading, sections } = await loadSections({ plots: [{ id: 'a-plot' }] });

        assert.deepStrictEqual(loading.map(labelOf), ['Loading...']);
        assert.deepStrictEqual(sections.map(labelOf), [
            'PLOTS',
            'E-MAILS',
            'GRIDS',
            'DOCUMENTS',
            'JOBS',
            'REPOS',
        ]);
    });

    test('opens the section for a user with a single kind of resource', async () => {
        const { sections } = await loadSections({ grids: [{ id: 'a' }, { id: 'b' }] });

        const { Expanded, Collapsed } = vscode.TreeItemCollapsibleState;
        assert.deepStrictEqual(stateOf(sections), [
            Collapsed,
            Collapsed,
            Expanded,
            Collapsed,
            Collapsed,
            Collapsed,
        ]);
        assert.deepStrictEqual(
            sections.map(s => s.description),
            ['empty', 'empty', '2', 'empty', 'empty', 'empty'],
        );
    });

    test('collapses everything for a user with several kinds', async () => {
        const { sections } = await loadSections({
            plots: [{ id: 'a' }],
            jobs: [{ id: 'b' }],
        });

        assert.ok(
            sections.every(s => s.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed),
            'no section should open when the user has more than one resource type',
        );
    });

    test('opens every section for a new user so each call to action is visible', async () => {
        const { resources, sections } = await loadSections({});

        assert.ok(
            sections.every(s => s.collapsibleState === vscode.TreeItemCollapsibleState.Expanded),
            'a user with nothing should see every "Create your first..." row',
        );

        const plotChildren = await resources.getChildren(sections[0]);
        assert.deepStrictEqual(plotChildren.map(labelOf), ['Create Your First Plot']);
    });

    test('opens a collapsed section when a resource is created in it', async () => {
        const { providers, resources, sections } = await loadSections({
            plots: [{ id: 'a' }],
            jobs: [{ id: 'b' }],
        });
        const { view, revealed } = fakeTreeView();
        resources.attachTreeView(view);

        providers.grids.setRoots([{ id: 'fresh-grid' }]);
        providers.grids.refresh();
        await waitFor(() => revealed.length > 0, 'the new grid should open its section');

        assert.deepStrictEqual(revealed.map(labelOf), ['GRIDS']);
        assert.strictEqual(sections[2].description, '1');

        // A delete leaves the user's layout alone.
        revealed.length = 0;
        providers.grids.setRoots([]);
        providers.grids.refresh();
        await waitFor(() => sections[2].description === 'empty', 'the count should drop back');

        assert.deepStrictEqual(revealed, []);
        resources.dispose();
    });

    test('isolate narrows a section to one resource and offers a way back', async () => {
        const { resources, sections } = await loadSections({
            plots: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        });
        const { view, revealed } = fakeTreeView();
        resources.attachTreeView(view);

        const plots = await resources.getChildren(sections[0]);
        assert.deepStrictEqual(plots.map(labelOf), ['a', 'b', 'c']);

        resources.isolate([plots[1] as MyTreeItem]);
        const isolated = await resources.getChildren(sections[0]);

        assert.deepStrictEqual(isolated.map(labelOf), ['Show all 3 plots', 'b']);
        assert.strictEqual(sections[0].description, '1/3', 'the hidden siblings stay counted');
        assert.deepStrictEqual(
            revealed.map(labelOf),
            ['b'],
            'isolating opens the resource, so what is left is the subtree',
        );

        // The way back is a row, because the other two plots are unreachable.
        assert.strictEqual(isolated[0].command?.command, 'novem.showAllInSection');
        assert.deepStrictEqual(isolated[0].command?.arguments, ['plots']);

        resources.showAll('plots');
        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), [
            'a',
            'b',
            'c',
        ]);
        assert.strictEqual(sections[0].description, '3');
        resources.dispose();
    });

    test('isolates two siblings at once and keeps them both', async () => {
        const { resources, sections } = await loadSections({
            plots: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        });
        const { view, revealed, collapse } = fakeTreeView();
        resources.attachTreeView(view);

        const plots = await resources.getChildren(sections[0]);
        resources.isolate([plots[0] as MyTreeItem, plots[2] as MyTreeItem]);

        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), [
            'Show all 3 plots',
            'a',
            'c',
        ]);
        assert.strictEqual(sections[0].description, '2/3');
        assert.deepStrictEqual(revealed.map(labelOf), ['a', 'c'], 'both should open');

        // Collapsing one of the two leaves the other isolated, rather than
        // throwing both back into the full list.
        collapse(plots[0]);
        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), [
            'Show all 3 plots',
            'c',
        ]);
        assert.strictEqual(sections[0].description, '1/3');

        // Collapsing the last one ends the isolation.
        collapse(plots[2]);
        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), [
            'a',
            'b',
            'c',
        ]);
        assert.strictEqual(sections[0].description, '3');
        resources.dispose();
    });

    test('splits a selection spanning types across their sections', async () => {
        const { resources, sections } = await loadSections({
            plots: [{ id: 'a' }, { id: 'b' }],
            jobs: [{ id: 'j1' }, { id: 'j2' }],
        });
        resources.attachTreeView(fakeTreeView().view);

        const plots = await resources.getChildren(sections[0]);
        const jobs = await resources.getChildren(sections[4]);
        resources.isolate([plots[1] as MyTreeItem, jobs[0] as MyTreeItem]);

        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), [
            'Show all 2 plots',
            'b',
        ]);
        assert.deepStrictEqual((await resources.getChildren(sections[4])).map(labelOf), [
            'Show all 2 jobs',
            'j1',
        ]);
        resources.dispose();
    });

    test('ignores files inside a resource — only whole resources isolate', async () => {
        const { resources, sections } = await loadSections({ plots: [{ id: 'a' }, { id: 'b' }] });
        resources.attachTreeView(fakeTreeView().view);

        const plots = (await resources.getChildren(sections[0])) as MyTreeItem[];
        const files = (await resources.getChildren(plots[0])) as MyTreeItem[];
        resources.isolate(files);

        assert.deepStrictEqual(
            (await resources.getChildren(sections[0])).map(labelOf),
            ['a', 'b'],
            'isolating a file would hide the rest of the resource it lives in',
        );
        assert.strictEqual(sections[0].description, '2');
        resources.dispose();
    });

    test('isolates per section, so a plot and a job can be open at once', async () => {
        const { resources, sections } = await loadSections({
            plots: [{ id: 'a' }, { id: 'b' }],
            jobs: [{ id: 'j1' }, { id: 'j2' }],
        });
        resources.attachTreeView(fakeTreeView().view);

        const [plots, jobs] = [
            await resources.getChildren(sections[0]),
            await resources.getChildren(sections[4]),
        ];
        resources.isolate([plots[0] as MyTreeItem]);
        resources.isolate([jobs[1] as MyTreeItem]);

        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), [
            'Show all 2 plots',
            'a',
        ]);
        assert.deepStrictEqual((await resources.getChildren(sections[4])).map(labelOf), [
            'Show all 2 jobs',
            'j2',
        ]);

        // Leaving one isolated section is not leaving the other.
        resources.showAll('plots');
        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), ['a', 'b']);
        assert.deepStrictEqual((await resources.getChildren(sections[4])).map(labelOf), [
            'Show all 2 jobs',
            'j2',
        ]);
        resources.dispose();
    });

    test('collapsing the isolated resource brings the siblings back', async () => {
        const { resources, sections } = await loadSections({ plots: [{ id: 'a' }, { id: 'b' }] });
        const { view, collapse } = fakeTreeView();
        resources.attachTreeView(view);

        const plots = await resources.getChildren(sections[0]);
        resources.isolate([plots[0] as MyTreeItem]);
        collapse(plots[0]);

        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), ['a', 'b']);
        assert.strictEqual(sections[0].description, '2');

        // Collapsing something else is not a way out.
        resources.isolate([plots[0] as MyTreeItem]);
        collapse(plots[1]);
        assert.deepStrictEqual((await resources.getChildren(sections[0])).map(labelOf), [
            'Show all 2 plots',
            'a',
        ]);
        resources.dispose();
    });

    test('drops the isolation when the resource it named is gone', async () => {
        const { providers, resources, sections } = await loadSections({
            plots: [{ id: 'a' }, { id: 'b' }],
        });
        resources.attachTreeView(fakeTreeView().view);

        const plots = await resources.getChildren(sections[0]);
        resources.isolate([plots[1] as MyTreeItem]);

        providers.plots.setRoots([{ id: 'a' }]);
        providers.plots.refresh();
        await waitFor(
            () => providers.plots.rootResourceCount() === 1,
            'the refreshed root list should come back',
        );

        assert.deepStrictEqual(
            (await resources.getChildren(sections[0])).map(labelOf),
            ['a'],
            'a deleted resource must not leave the section stuck on nothing',
        );
        assert.strictEqual(sections[0].description, '1');
        resources.dispose();
    });

    test('drops the isolation when a resource is created into the section', async () => {
        const { providers, resources, sections } = await loadSections({
            plots: [{ id: 'a' }, { id: 'b' }],
        });
        resources.attachTreeView(fakeTreeView().view);

        const plots = await resources.getChildren(sections[0]);
        resources.isolate([plots[0] as MyTreeItem]);

        providers.plots.setRoots([{ id: 'a' }, { id: 'b' }, { id: 'fresh' }]);
        providers.plots.refresh();
        await waitFor(
            () => providers.plots.rootResourceCount() === 3,
            'the new plot should come back in the root list',
        );

        assert.deepStrictEqual(
            (await resources.getChildren(sections[0])).map(labelOf),
            ['a', 'b', 'fresh'],
            'a plot created while isolated must not land hidden',
        );
        assert.strictEqual(sections[0].description, '3');
        resources.dispose();
    });

    test('keeps a section open once the user has opened it', async () => {
        const { providers, resources, sections } = await loadSections({ plots: [{ id: 'a' }] });

        // VSCode owns expansion after the first paint, so a later rebuild must
        // not push its own collapsible state back onto the sections.
        const before = stateOf(sections);
        const refresh = waitForTreeRefresh(providers.jobs);
        providers.jobs.refresh();
        await refresh;

        assert.deepStrictEqual(stateOf(await resources.getChildren()), before);
        resources.dispose();
    });
});
