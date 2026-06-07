import * as vscode from 'vscode';

import { UserConfig, UserProfile, typeToIcon, getActiveProfile } from './config';
import NovemApi from './novem-api';

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
    private hasLoaded = false;

    refresh(): void {
        console.log(`Refreshing ${this.getType()} provider`);
        // Bust the memoised GraphQL aggregate so the next root fetch is fresh.
        // Covers every refresh path: the refresh commands, and create/delete
        // which call refresh() to surface/remove a resource.
        this.api.invalidateVisCache();
        this._onDidChangeTreeData.fire();
    }

    setStatus(message: string): void {
        this.statusMessage = message;
        this._onDidChangeTreeData.fire();
    }

    clearStatus(): void {
        this.statusMessage = null;
        this._onDidChangeTreeData.fire();
    }

    private async loadInitial(username: string): Promise<void> {
        try {
            await this.getRootItems(username);
        } finally {
            this.hasLoaded = true;
            this._onDidChangeTreeData.fire();
        }
    }

    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    // Abstract methods that subclasses must implement
    abstract getType(): VisType;
    abstract getRootItems(username: string): Promise<any[]>;
    abstract getChildItems(visId: string, path?: string): Promise<any[]>;

    private static readonly CREATE_COMMANDS: Record<string, { command: string; label: string }> = {
        plots: { command: 'novem.createNovemPlot', label: 'Create New Plot...' },
        mails: { command: 'novem.createNovemMail', label: 'Create New Mail...' },
        grids: { command: 'novem.createNovemGrid', label: 'Create New Grid...' },
        docs: { command: 'novem.createNovemDoc', label: 'Create New Document...' },
        jobs: { command: 'novem.createNovemJob', label: 'Create New Job...' },
        repos: { command: 'novem.createNovemRepo', label: 'Create New Repo...' },
    };

    async getChildren(element?: MyTreeItem): Promise<vscode.TreeItem[]> {
        const profile = this.context.globalState.get('userProfile') as UserProfile;

        if (!element) {
            // Show a loading spinner before the first load completes
            // (prevents viewsWelcome from flashing during data fetch)
            if (!this.hasLoaded) {
                this.loadInitial(profile.user_info.username!);
                const loadingItem = new vscode.TreeItem('Loading...');
                loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');
                return [loadingItem];
            }

            try {
                console.log(`Fetching root items for ${this.getType()}`);
                const response = await this.getRootItems(profile.user_info.username!);

                const items: vscode.TreeItem[] = [];

                if (this.statusMessage) {
                    const statusItem = new vscode.TreeItem(this.statusMessage);
                    statusItem.iconPath = new vscode.ThemeIcon('loading~spin');
                    items.push(statusItem);
                }

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

                // Add a "Create New..." button at the bottom (only when there are items;
                // empty views use viewsWelcome instead)
                if (rootItems.length > 0) {
                    const createInfo = BaseNovemProvider.CREATE_COMMANDS[this.getType()];
                    if (createInfo) {
                        const createItem = new vscode.TreeItem(createInfo.label);
                        createItem.iconPath = new vscode.ThemeIcon('add');
                        createItem.command = {
                            command: createInfo.command,
                            title: createInfo.label,
                        };
                        items.push(createItem);
                    }
                }

                return items;
            } catch (error) {
                console.error(`Error loading ${this.getType()}:`, error);
                return [new vscode.TreeItem(`Error loading ${this.getType()}`)];
            }
        } else {
            function splitWithLimit(str: string, delimiter: string, limit: number): string[] {
                const parts = str.split(delimiter);
                const selected = parts.slice(0, limit);
                selected.push(parts.slice(limit).join(delimiter));
                return selected;
            }

            const [_, visId, path] = splitWithLimit(element.path, '/', 2);
            if (element.type !== 'dir') throw new Error('Invalid type');

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
                                element ? element.path : '',
                                '',
                            ),
                    );
            } catch (error) {
                console.error(`Error loading ${this.getType()} children:`, error);
                return [new vscode.TreeItem(`Error loading ${this.getType()}`)];
            }
        }
    }
}

type VisType = 'plots' | 'mails' | 'grids' | 'docs' | 'jobs' | 'repos';

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

// Root lists come from the single memoised GraphQL aggregate (api.getSelfVis);
// children (files inside a resource) stay on REST and load lazily.
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
    (api, u) => api.getSelfVis(u).then(a => a.jobs),
    (api, id, path) => api.getDetailsForJob(id, path),
);
export const ReposProvider = makeProvider(
    'repos',
    (api, u) => api.getSelfVis(u).then(a => a.repos),
    (api, id, path) => api.getDetailsForRepo(id, path),
);

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
