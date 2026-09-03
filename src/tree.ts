import * as vscode from 'vscode';

import { UserConfig, UserProfile, typeToIcon, getActiveProfile } from './config';
import NovemApi from './novem-api';

export type VisType = 'plots' | 'mails' | 'grids' | 'docs' | 'jobs' | 'repos';

// The create action for each resource type. Non-empty sections expose it as an
// inline button on the section row; empty ones render `emptyLabel` as a child,
// which is the only call to action a user with no resources of that type sees.
const CREATE_ACTIONS: Record<VisType, { command: string; emptyLabel: string }> = {
    plots: { command: 'novem.createNovemPlot', emptyLabel: 'Create Your First Plot' },
    mails: { command: 'novem.createNovemMail', emptyLabel: 'Create Your First E-Mail' },
    grids: { command: 'novem.createNovemGrid', emptyLabel: 'Create Your First Grid' },
    docs: { command: 'novem.createNovemDoc', emptyLabel: 'Create Your First Document' },
    jobs: { command: 'novem.createNovemJob', emptyLabel: 'Create Your First Job' },
    repos: { command: 'novem.createNovemRepo', emptyLabel: 'Create Your First Repo' },
};

// One row per resource type, in the order they appear in the sidebar.
//
// Labels are upper case because these rows replaced six view headers, which
// VSCode itself renders upper case. A tree item gets no styling of its own --
// no separator, no padding, no font weight -- so the casing is what separates
// a section from the resources under it.
const SECTIONS: { type: VisType; label: string; icon: string }[] = [
    { type: 'plots', label: 'PLOTS', icon: 'graph' },
    { type: 'mails', label: 'E-MAILS', icon: 'mail' },
    { type: 'grids', label: 'GRIDS', icon: 'table' },
    { type: 'docs', label: 'DOCUMENTS', icon: 'book' },
    { type: 'jobs', label: 'JOBS', icon: 'run' },
    { type: 'repos', label: 'REPOS', icon: 'repo' },
];

// The way out of an isolated section, and the only sign of the siblings it is
// hiding, so it names how many there are.
function createShowAllItem(type: VisType, total: number): vscode.TreeItem {
    const noun = SECTIONS.find(section => section.type === type)?.label.toLowerCase() ?? type;
    const showAll = new vscode.TreeItem(`Show all ${total} ${noun}`);
    showAll.id = `novem-show-all-${type}`;
    showAll.iconPath = new vscode.ThemeIcon('arrow-left');
    showAll.command = {
        command: 'novem.showAllInSection',
        title: 'Show All',
        arguments: [type],
    };
    return showAll;
}

function createLoadingItem(): vscode.TreeItem {
    const loadingItem = new vscode.TreeItem('Loading...');
    loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');
    return loadingItem;
}

// Base class for all Novem tree providers
export abstract class BaseNovemProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    protected context: vscode.ExtensionContext;
    protected api: NovemApi;

    constructor(api: NovemApi, context: vscode.ExtensionContext) {
        this.api = api;
        this.context = context;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<MyTreeItem | undefined | null | void> =
        new vscode.EventEmitter<MyTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MyTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private statusMessage: string | null = null;
    private rootItems: vscode.TreeItem[] | null = null;
    private rootCount: number | null = null;
    private rootLoadPromise: Promise<void> | null = null;

    // Top-level resource nodes by id, captured on each root fetch so a single
    // resource's subtree can be refreshed without rebuilding the whole tree.
    private rootNodes = new Map<string, MyTreeItem>();

    refresh(): void {
        console.log(`Refreshing ${this.getType()} provider`);
        // Bust the memoised GraphQL aggregate so the next root fetch is fresh.
        // Covers every refresh path: the refresh commands, and create/delete
        // which call refresh() to surface/remove a resource.
        this.api.invalidateVisCache();
        this.rootItems = null;
        this.rootCount = null;
        this.rootLoadPromise = null;
        this.rootNodes.clear();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Re-fetch a single resource's subtree (its files/folders) — used after we
     * mutate its config so structural changes (e.g. a new config/custom folder)
     * appear without rebuilding the whole tree or re-fetching the root list.
     * Falls back to a full refresh if the node isn't currently rendered.
     */
    refreshResource(visId: string): void {
        const node = this.rootNodes.get(visId);
        if (node) {
            this._onDidChangeTreeData.fire(node);
        } else {
            this.refresh();
        }
    }

    setStatus(message: string): void {
        this.statusMessage = message;
        this._onDidChangeTreeData.fire();
    }

    clearStatus(): void {
        this.statusMessage = null;
        this._onDidChangeTreeData.fire();
    }

    primeRootItems(response: any[]): void {
        const { items, rootNodes, count } = this.buildRootTreeItems(response);
        this.rootItems = items;
        this.rootNodes = rootNodes;
        this.rootCount = count;
        this.rootLoadPromise = null;
        this._onDidChangeTreeData.fire();
    }

    /**
     * How many resources of this type the user has, or null while the root list
     * is still loading. NovemResourcesProvider needs every count in before it
     * can decide which sections open.
     */
    rootResourceCount(): number | null {
        return this.rootCount;
    }

    /**
     * Start the root fetch if it hasn't run yet (or was invalidated by
     * refresh()), and report the count if it's already in. Priming from the
     * activation-time aggregate usually beats us to it; this is the fallback
     * for when that request failed.
     */
    ensureRootLoaded(): number | null {
        if (this.rootCount === null && !this.rootLoadPromise) {
            const profile = this.context.globalState.get('userProfile') as UserProfile;
            this.getRootTreeItems(profile.user_info.username!);
        }
        return this.rootCount;
    }

    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    // Abstract methods that subclasses must implement
    abstract getType(): VisType;
    abstract getRootItems(username: string): Promise<any[]>;
    abstract getChildItems(visId: string, path?: string): Promise<any[]>;

    private getRootTreeItems(username: string): vscode.TreeItem[] {
        if (this.rootItems) {
            return this.withStatusItem(this.rootItems);
        }

        if (!this.rootLoadPromise) {
            let rootLoad: Promise<void>;
            rootLoad = this.fetchRootTreeItems(username)
                .then(({ items, rootNodes, count }) => {
                    if (this.rootLoadPromise === rootLoad) {
                        this.rootItems = items;
                        this.rootNodes = rootNodes;
                        this.rootCount = count;
                    }
                })
                .finally(() => {
                    if (this.rootLoadPromise === rootLoad) {
                        this.rootLoadPromise = null;
                        this._onDidChangeTreeData.fire();
                    }
                });
            this.rootLoadPromise = rootLoad;
        }

        return [createLoadingItem()];
    }

    private buildRootTreeItems(response: any[]): {
        items: vscode.TreeItem[];
        rootNodes: Map<string, MyTreeItem>;
        count: number;
    } {
        const items: vscode.TreeItem[] = [];
        const rootNodes = new Map<string, MyTreeItem>();

        const rootItems = (Array.isArray(response) ? response : [])
            .sort((a: any, b: any) => {
                const aId = a.id || a.name;
                const bId = b.id || b.name;
                return aId.localeCompare(bId);
            })
            .map(
                (each: any) =>
                    new MyTreeItem(
                        this,
                        each.id || each.name,
                        'dir',
                        each.permissions || ['r', 'w', 'd'],
                        this.getType(),
                        '',
                        each.type || (this.getType() === 'jobs' ? 'job' : 'repo'),
                    ),
            );

        items.push(...rootItems);

        // Track top-level nodes so refreshResource() can re-fetch a
        // single resource's subtree.
        for (const node of rootItems) {
            rootNodes.set(node.name, node);
        }

        // A section with resources gets its create action as an inline button on
        // the section row, so the tree stays as short as it can be. An empty
        // section has no row to hover, so the call to action goes in the tree.
        if (rootItems.length === 0) {
            const createInfo = CREATE_ACTIONS[this.getType()];
            const createItem = new vscode.TreeItem(createInfo.emptyLabel);
            createItem.iconPath = new vscode.ThemeIcon('add');
            createItem.command = {
                command: createInfo.command,
                title: createInfo.emptyLabel,
            };
            items.push(createItem);
        }

        return { items, rootNodes, count: rootItems.length };
    }

    private withStatusItem(items: vscode.TreeItem[]): vscode.TreeItem[] {
        if (!this.statusMessage) {
            return items;
        }

        const statusItem = new vscode.TreeItem(this.statusMessage);
        statusItem.iconPath = new vscode.ThemeIcon('loading~spin');
        return [statusItem, ...items];
    }

    private async fetchRootTreeItems(
        username: string,
    ): Promise<{ items: vscode.TreeItem[]; rootNodes: Map<string, MyTreeItem>; count: number }> {
        try {
            console.log(`Fetching root items for ${this.getType()}`);
            const response = await this.getRootItems(username);

            return this.buildRootTreeItems(response);
        } catch (error) {
            console.error(`Error loading ${this.getType()}:`, error);
            // Count 0 rather than leaving it unknown: a failed list must not
            // hold the rest of the sidebar behind a spinner forever.
            return {
                items: [new vscode.TreeItem(`Error loading ${this.getType()}`)],
                rootNodes: new Map(),
                count: 0,
            };
        }
    }

    private async fetchChildTreeItems(element: MyTreeItem): Promise<vscode.TreeItem[]> {
        function splitWithLimit(str: string, delimiter: string, limit: number): string[] {
            const parts = str.split(delimiter);
            const selected = parts.slice(0, limit);
            selected.push(parts.slice(limit).join(delimiter));
            return selected;
        }

        const [_, visId, path] = splitWithLimit(element.path, '/', 2);

        try {
            console.log(`Fetching child items for ${this.getType()} - ${visId}/${path || ''}`);
            const response = await this.getChildItems(visId, path);

            return response
                .filter((each: any) => ['file', 'dir', 'link'].includes(each.type))
                .sort((a: any, b: any) => {
                    const aIsDir = a.type === 'dir';
                    const bIsDir = b.type === 'dir';

                    if (aIsDir && !bIsDir) return -1;
                    if (!aIsDir && bIsDir) return 1;

                    return a.name.localeCompare(b.name);
                })
                .map(
                    (each: any) =>
                        new MyTreeItem(
                            this,
                            each.name,
                            each.type,
                            each.permissions,
                            this.getType(),
                            element.path,
                            '',
                        ),
                );
        } catch (error) {
            console.error(`Error loading ${this.getType()} children:`, error);
            return [new vscode.TreeItem(`Error loading ${this.getType()}`)];
        }
    }

    getChildren(element?: MyTreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        const profile = this.context.globalState.get('userProfile') as UserProfile;

        if (!element) {
            return this.getRootTreeItems(profile.user_info.username!);
        } else {
            if (element.type !== 'dir') throw new Error('Invalid type');
            return this.fetchChildTreeItems(element);
        }
    }
}

function makeProvider(
    type: VisType,
    getRootFn: (api: NovemApi, username: string) => Promise<any[]>,
    getChildFn: (api: NovemApi, id: string, path?: string) => Promise<any[]>,
) {
    return class extends BaseNovemProvider {
        getType() {
            return type;
        }
        async getRootItems(username: string) {
            return getRootFn(this.api, username);
        }
        async getChildItems(id: string, path?: string) {
            return getChildFn(this.api, id, path);
        }
    };
}

// Vis root lists come from the single memoised GraphQL aggregate
// (api.getSelfVis); children (files inside a resource) stay on REST and load
// lazily. Jobs/repos keep the direct code list endpoints because those are
// fast and independent of the vis aggregate.
export const PlotsProvider = makeProvider(
    'plots',
    (api, u) => api.getSelfVis(u).then(a => a.plots),
    (api, id, path) => api.getDetailsForVis('plots', id, path),
);
export const MailsProvider = makeProvider(
    'mails',
    (api, u) => api.getSelfVis(u).then(a => a.mails),
    (api, id, path) => api.getDetailsForVis('mails', id, path),
);
export const GridsProvider = makeProvider(
    'grids',
    (api, u) => api.getSelfVis(u).then(a => a.grids),
    (api, id, path) => api.getDetailsForVis('grids', id, path),
);
export const DocsProvider = makeProvider(
    'docs',
    (api, u) => api.getSelfVis(u).then(a => a.docs),
    (api, id, path) => api.getDetailsForVis('docs', id, path),
);
export const JobsProvider = makeProvider(
    'jobs',
    (api, u) => api.getJobsForUser(u),
    (api, id, path) => api.getDetailsForJob(id, path),
);
export const ReposProvider = makeProvider(
    'repos',
    (api, u) => api.getReposForUser(u),
    (api, id, path) => api.getDetailsForRepo(id, path),
);

/**
 * A resource-type row ("Plots", "Jobs", ...) in the unified sidebar tree.
 */
export class NovemSectionItem extends vscode.TreeItem {
    constructor(
        public readonly visType: VisType,
        label: string,
        icon: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        // A stable id is what lets VSCode remember the user's own expand and
        // collapse per section, so our computed state only decides how a
        // section first appears and never fights them afterwards.
        this.id = `novem-section-${visType}`;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = `section-${visType}`;
    }
}

/**
 * The whole Novem sidebar as one tree: a row per resource type, each delegating
 * to the per-type provider that already knows how to load it.
 *
 * Six separate views could only ever be collapsed through package.json, which
 * VSCode applies to the initial layout and never again. Sections are tree items
 * here, so their collapsed state is ours to decide from what the user actually
 * has: everything shut except the one type they use, and everything open for a
 * new user, whose six "Create your first..." rows are the point of the view.
 */
export class NovemResourcesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly sections = new Map<VisType, NovemSectionItem>();
    private readonly counts = new Map<VisType, number>();
    // The resources a section is narrowed to, by name, for the types the user
    // has asked to isolate. A set rather than one name because two plots side
    // by side is a normal way to work; per type, so isolating a plot leaves a
    // job isolated (or not) exactly as it was.
    private readonly isolated = new Map<VisType, Set<string>>();
    private readonly subscriptions: vscode.Disposable[] = [];
    private treeView: vscode.TreeView<vscode.TreeItem> | null = null;
    private sectionsBuilt = false;

    private _onDidChangeTreeData = new vscode.EventEmitter<
        vscode.TreeItem | undefined | null | void
    >();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    constructor(private readonly providers: Record<VisType, BaseNovemProvider>) {
        for (const { type } of SECTIONS) {
            this.subscriptions.push(
                providers[type].onDidChangeTreeData(element =>
                    this.onSectionChanged(type, element),
                ),
            );
        }
    }

    dispose(): void {
        for (const subscription of this.subscriptions) subscription.dispose();
        this.subscriptions.length = 0;
        this._onDidChangeTreeData.dispose();
    }

    attachTreeView(treeView: vscode.TreeView<vscode.TreeItem>): void {
        this.treeView = treeView;
        // Collapsing the resource you isolated is the other way out, next to
        // the "Show all" row: shutting it would otherwise leave the section
        // showing a single collapsed row and no sign of the rest.
        this.subscriptions.push(
            treeView.onDidCollapseElement(({ element }) => {
                if (element instanceof MyTreeItem) this.deisolate(element);
            }),
        );
        this.updateTreeViewMessage();
    }

    /**
     * Narrow each section to the resources given, hiding their siblings.
     * Opt-in -- nothing isolates on its own -- because working on two plots
     * side by side is as common as wanting one of them on its own, which is
     * also why this takes a selection rather than a single resource.
     *
     * A selection spanning types isolates each type to its own share of it.
     */
    isolate(items: MyTreeItem[]): void {
        const byType = new Map<VisType, Set<string>>();
        for (const item of items) {
            const type = item.visType as VisType;
            // Only whole resources: isolating a file inside one would hide the
            // rest of the resource, which is not what the section is listing.
            if (!this.sections.has(type) || item.path.split('/').length !== 2) continue;
            const names = byType.get(type) ?? new Set<string>();
            names.add(item.name);
            byType.set(type, names);
        }

        for (const [type, names] of byType) {
            this.isolated.set(type, names);
            this.refreshSection(type);
        }

        // Isolating from collapsed rows should open them: hiding the siblings
        // is only worth anything if what's left is the subtrees you wanted.
        for (const item of items) {
            if (this.isIsolated(item)) {
                void this.treeView?.reveal(item, { expand: true, select: false, focus: false });
            }
        }
    }

    /** Undo isolate(): the section lists everything again. */
    showAll(type: VisType): void {
        if (!this.isolated.delete(type)) return;
        this.refreshSection(type);
    }

    private isIsolated(item: MyTreeItem): boolean {
        return this.isolated.get(item.visType as VisType)?.has(item.name) ?? false;
    }

    /**
     * Drop one resource from a section's isolation, ending it once nothing is
     * left. Collapsing one of two isolated plots should leave the other
     * isolated, not throw both back into a list of 89.
     */
    private deisolate(item: MyTreeItem): void {
        const type = item.visType as VisType;
        const names = this.isolated.get(type);
        if (!names?.delete(item.name)) return;
        if (names.size === 0) this.isolated.delete(type);
        this.refreshSection(type);
    }

    private refreshSection(type: VisType): void {
        const section = this.sections.get(type);
        if (!section) return;
        section.description = this.countLabel(this.counts.get(type) ?? null, type);
        this._onDidChangeTreeData.fire(section);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    // Needed by reveal(). Only top-level resources have a parent we can name
    // without walking their path back through the API, and nothing reveals
    // anything deeper than that.
    getParent(element: vscode.TreeItem): vscode.TreeItem | undefined {
        if (element instanceof MyTreeItem && element.path.split('/').length === 2) {
            return this.sections.get(element.visType as VisType);
        }
        return undefined;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element instanceof NovemSectionItem) {
            const children = (await this.providers[element.visType].getChildren()) ?? [];
            return this.applyIsolation(element.visType, children);
        }
        if (element instanceof MyTreeItem) {
            return (await element.parent.getChildren(element)) ?? [];
        }
        if (element) return [];
        return this.getSectionItems();
    }

    /**
     * An isolated section shows the chosen resource and a row to get back; the
     * siblings are simply not returned. VSCode has no way to hide or filter
     * rows, but which children a section has is ours to decide.
     */
    private applyIsolation(type: VisType, children: vscode.TreeItem[]): vscode.TreeItem[] {
        const names = this.isolated.get(type);
        if (!names) return children;

        const chosen = children.filter(
            child => child instanceof MyTreeItem && names.has(child.name),
        );
        if (chosen.length === 0) {
            // Every isolated resource is gone -- renamed, or deleted from
            // elsewhere. Drop the isolation rather than showing nothing.
            this.showAll(type);
            return children;
        }

        const total = children.filter(child => child instanceof MyTreeItem).length;
        return [createShowAllItem(type, total), ...chosen];
    }

    private getSectionItems(): vscode.TreeItem[] {
        const counts = new Map<VisType, number | null>();
        for (const { type } of SECTIONS) {
            counts.set(type, this.providers[type].ensureRootLoaded());
        }

        // Which sections open depends on all six counts, so hold the tree back
        // until they're all in. Every list is fetched in parallel at activation,
        // so this is one round trip's wait, not six — and it avoids the sections
        // visibly rearranging themselves a moment after they first paint.
        if (!this.sectionsBuilt && [...counts.values()].some(count => count === null)) {
            this.updateTreeViewMessage();
            return [createLoadingItem()];
        }

        const populated = SECTIONS.filter(({ type }) => (counts.get(type) ?? 0) > 0);
        const soleType = populated.length === 1 ? populated[0].type : null;
        const openEverything = populated.length === 0;
        const firstBuild = !this.sectionsBuilt;

        this.sectionsBuilt = true;
        this.updateTreeViewMessage();

        return SECTIONS.map(({ type, label, icon }) => {
            const section = this.sectionItem(type, label, icon);
            if (firstBuild && (openEverything || type === soleType)) {
                section.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            }
            const count = counts.get(type) ?? null;
            if (count !== null) this.counts.set(type, count);
            section.description = this.countLabel(count, type);
            return section;
        });
    }

    // Section items are created once and mutated in place: firing a change event
    // for one only works against the object VSCode was handed.
    private sectionItem(type: VisType, label: string, icon: string): NovemSectionItem {
        let section = this.sections.get(type);
        if (!section) {
            section = new NovemSectionItem(type, label, icon);
            this.sections.set(type, section);
        }
        return section;
    }

    // The count on a collapsed row is the only thing telling the user what's
    // behind it, so an empty section says so rather than showing a bare 0.
    // An isolated section reads "2/89", so the hidden siblings are visible as a
    // number even when the section is shut.
    private countLabel(count: number | null, type: VisType): string {
        if (count === null) return '';
        const isolated = this.isolated.get(type);
        if (isolated) return `${isolated.size}/${count}`;
        return count > 0 ? String(count) : 'empty';
    }

    private onSectionChanged(type: VisType, element?: MyTreeItem | null | void): void {
        const section = this.sections.get(type);
        if (!section) {
            // Still on the loading placeholder — rebuild the root instead.
            this._onDidChangeTreeData.fire();
            return;
        }
        if (element) {
            this._onDidChangeTreeData.fire(element);
            return;
        }
        // VSCode never re-requests the children of a collapsed row, so a
        // section invalidated by refresh() would sit on a stale count forever
        // unless we drive the reload ourselves. It's a no-op once the count is
        // back, and the load fires this handler again with the new one.
        const count = this.providers[type].ensureRootLoaded();
        const previous = this.counts.get(type);
        if (count !== null) this.counts.set(type, count);

        // Something new landed in this section — only growth, so a delete or a
        // plain refresh leaves the user's layout alone.
        const grew = previous !== undefined && count !== null && count > previous;

        // An isolated section hides every sibling, so a resource created into
        // one would land invisible. That's the same "out of sight" problem the
        // reveal below exists to prevent, so creating drops the isolation.
        if (grew) this.isolated.delete(type);

        section.description = this.countLabel(count, type);
        this._onDidChangeTreeData.fire(section);

        // If the section is collapsed the user just created a resource they
        // can't see, so open it for them.
        if (grew) {
            void this.treeView?.reveal(section, { expand: true, select: false, focus: false });
        }
    }

    private updateTreeViewMessage(): void {
        if (!this.treeView) return;
        this.treeView.message = this.sectionsBuilt ? undefined : 'Loading...';
    }
}

// Keep the original class name for backward compatibility
export const NovemSideBarProvider = BaseNovemProvider;

export class NovemDummyProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: MyTreeItem): Promise<vscode.TreeItem[]> {
        return [];
    }
}

export class MyTreeItem extends vscode.TreeItem {
    public readonly path: string;
    public readonly desc: string;

    constructor(
        public readonly parent: BaseNovemProvider,
        public readonly name: string,
        public readonly type: string,
        public readonly permissions: string[],
        public readonly visType: string,
        parentPath: string = '',
        public readonly iconType: string,
    ) {
        super(
            name,
            type === 'dir'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        );
        const depth = parentPath.split('/').length - 1;

        this.path = `${parentPath}/${this.name}`;
        this.visType = visType;
        // A stable id per row. Isolating a resource re-renders its whole
        // section, and without an id VSCode tracks rows by position, so the
        // expansion the user just made would be dropped on the way.
        this.id = `novem-item-${visType}${this.path}`;

        const FILE_DOCTYPES: Record<string, string> = {
            'custom.js': 'javascript',
            'custom.css': 'css',
            'custom.deps': 'plaintext',
            ...(this.visType === 'jobs' ? { data: 'json' } : {}),
        };
        const doctype = FILE_DOCTYPES[this.name] ?? 'nv_markdown';

        this.desc = ``;
        // Set the icon and its color based on type and permissions
        if (type === 'file') {
            this.desc = `[${this.permissionsToUnixStyle(this.permissions)}]`;
            this.command = {
                command: 'novem.openFile',
                title: 'Open File',
                arguments: [
                    vscode.Uri.from({ scheme: 'novem', authority: this.visType, path: this.path }),
                    this.type,
                    doctype,
                ],
            };

            if (permissions.includes('d')) {
                this.contextValue = 'file-deletable';
            }
        } else if (type === 'link') {
            this.iconPath = new vscode.ThemeIcon('link');
            this.desc = `[${this.permissionsToUnixStyle(this.permissions)}]`;

            if (permissions.includes('d')) {
                this.contextValue = 'file-deletable';
            }
        } else if (type === 'dir') {
            // Fixed icons per type; plots falls back to typeToIcon() since icon
            // varies by plot kind (bar, line, etc.)
            const VIS_TOP: Record<string, { icon: string; contextValue: string }> = {
                plots: { icon: '', contextValue: 'plot-top' },
                mails: { icon: 'mail', contextValue: 'mail-top' },
                grids: { icon: 'table', contextValue: 'grid-top' },
                docs: { icon: 'book', contextValue: 'doc-top' },
                jobs: { icon: 'run', contextValue: 'job-top' },
                repos: { icon: 'repo', contextValue: 'repo-top' },
            };
            if (depth === 0 && this.visType in VIS_TOP) {
                const { icon, contextValue } = VIS_TOP[this.visType];
                this.iconPath = this.createColoredIcon(icon || typeToIcon(iconType), permissions);
                this.contextValue =
                    this.visType === 'plots' && iconType === 'custom'
                        ? 'plot-top-custom'
                        : contextValue;

                // Clicking a viewable resource opens its preview (the chevron
                // still expands to browse files). VSCode tree items can't
                // distinguish a plain click from a ctrl/cmd+click, so plain
                // click is wired to View — the resource's primary action.
                const VIEW_COMMANDS: Record<string, string> = {
                    plots: 'novem.viewNovemPlot',
                    mails: 'novem.viewNovemMail',
                    grids: 'novem.viewNovemGrid',
                    docs: 'novem.viewNovemDoc',
                };
                const viewCommand = VIEW_COMMANDS[this.visType];
                if (viewCommand) {
                    this.command = {
                        command: viewCommand,
                        title: 'View',
                        arguments: [this],
                    };
                }
            }

            if (depth > 0) {
                const isWritable = permissions.includes('w');
                const isDeletable = permissions.includes('d');

                if (isWritable && isDeletable) {
                    this.contextValue = 'dir-writable-deletable';
                } else if (isWritable) {
                    this.contextValue = 'dir-writable';
                } else if (isDeletable) {
                    this.contextValue = 'dir-deletable';
                }
            }
        }

        this.description = this.desc;
    }

    tooltip = `${this.name} (${this.type}) - Permissions: ${this.permissions.join(', ')}`;

    private createColoredIcon(iconType: string, permissions: string[]): vscode.ThemeIcon {
        console.log(`Creating icon for ${iconType} with permissions: ${permissions.join(', ')}`);
        let color: vscode.ThemeColor | undefined = new vscode.ThemeColor('terminal.ansiGreen');

        if (permissions.includes('w')) {
            color = new vscode.ThemeColor('terminal.ansiGreen');
        } else if (permissions.includes('r')) {
            color = new vscode.ThemeColor('terminal.ansiYellow');
        } else if (permissions.includes('d')) {
            color = new vscode.ThemeColor('terminal.ansiRed');
        }

        return new vscode.ThemeIcon(iconType, color);
    }

    private permissionsToUnixStyle(permissions: string[]): string {
        const permOrder: string[] = ['r', 'w', 'd'];
        let permString: string[] = ['-', '-', '-'];

        for (let i = 0; i < permOrder.length; i++) {
            if (permissions.includes(permOrder[i])) {
                permString[i] = permOrder[i];
            }
        }

        return permString.join('');
    }
}
