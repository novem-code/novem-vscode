import * as vscode from 'vscode';

import {
    UserConfig,
    UserProfile,
    typeToIcon,
    getActiveProfile,
} from './config';
import NovemApi from './novem-api';

// Base class for all Novem tree providers
export abstract class BaseNovemProvider
    implements vscode.TreeDataProvider<vscode.TreeItem>
{
    protected context: vscode.ExtensionContext;
    protected api: NovemApi;

    constructor(api: NovemApi, context: vscode.ExtensionContext) {
        this.api = api;
        this.context = context;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        MyTreeItem | undefined | null | void
    > = new vscode.EventEmitter<MyTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        MyTreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    refresh(): void {
        console.log(`Refreshing ${this.getType()} provider`);
        this._onDidChangeTreeData.fire();
    }

    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    // Abstract methods that subclasses must implement
    abstract getType(): 'plots' | 'mails' | 'jobs' | 'repos';
    abstract getRootItems(username: string): Promise<any[]>;
    abstract getChildItems(visId: string, path?: string): Promise<any[]>;

    async getChildren(element?: MyTreeItem): Promise<vscode.TreeItem[]> {
        const profile = this.context.globalState.get(
            'userProfile',
        ) as UserProfile;

        if (!element) {
            try {
                console.log(`Fetching root items for ${this.getType()}`);
                const response = await this.getRootItems(
                    profile.user_info.username!,
                );

                return (Array.isArray(response) ? response : [])
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
                                each.type ||
                                    (this.getType() === 'jobs'
                                        ? 'job'
                                        : 'repo'),
                            ),
                    );
            } catch (error) {
                console.error(`Error loading ${this.getType()}:`, error);
                return [new vscode.TreeItem(`Error loading ${this.getType()}`)];
            }
        } else {
            function splitWithLimit(
                str: string,
                delimiter: string,
                limit: number,
            ): string[] {
                const parts = str.split(delimiter);
                const selected = parts.slice(0, limit);
                selected.push(parts.slice(limit).join(delimiter));
                return selected;
            }

            const [_, visId, path] = splitWithLimit(element.path, '/', 2);
            if (element.type !== 'dir') throw new Error('Invalid type');

            try {
                console.log(
                    `Fetching child items for ${this.getType()} - ${visId}/${path || ''}`,
                );
                const response = await this.getChildItems(visId, path);

                return response
                    .filter((each: any) =>
                        ['file', 'dir', 'link'].includes(each.type),
                    )
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
                console.error(
                    `Error loading ${this.getType()} children:`,
                    error,
                );
                return [new vscode.TreeItem(`Error loading ${this.getType()}`)];
            }
        }
    }
}

// Specific provider implementations
export class PlotsProvider extends BaseNovemProvider {
    getType(): 'plots' {
        return 'plots';
    }

    async getRootItems(username: string): Promise<any[]> {
        console.log(`PlotsProvider: Fetching plots for ${username}`);
        return await this.api.getPlotsForUser(username);
    }

    async getChildItems(visId: string, path?: string): Promise<any[]> {
        console.log(
            `PlotsProvider: Fetching details for ${visId}/${path || ''}`,
        );
        return await this.api.getDetailsForVis('plots', visId, path);
    }
}

export class MailsProvider extends BaseNovemProvider {
    getType(): 'mails' {
        return 'mails';
    }

    async getRootItems(username: string): Promise<any[]> {
        console.log(`MailsProvider: Fetching mails for ${username}`);
        return await this.api.getMailsForUser(username);
    }

    async getChildItems(visId: string, path?: string): Promise<any[]> {
        console.log(
            `MailsProvider: Fetching details for ${visId}/${path || ''}`,
        );
        return await this.api.getDetailsForVis('mails', visId, path);
    }
}

export class JobsProvider extends BaseNovemProvider {
    getType(): 'jobs' {
        return 'jobs';
    }

    async getRootItems(username: string): Promise<any[]> {
        console.log(`JobsProvider: Fetching jobs for ${username}`);
        return await this.api.getJobsForUser(username);
    }

    async getChildItems(visId: string, path?: string): Promise<any[]> {
        console.log(
            `JobsProvider: Fetching job details for ${visId}/${path || ''}`,
        );
        return await this.api.getDetailsForJob(visId, path);
    }
}

export class ReposProvider extends BaseNovemProvider {
    getType(): 'repos' {
        return 'repos';
    }

    async getRootItems(username: string): Promise<any[]> {
        console.log(`ReposProvider: Fetching repos for ${username}`);
        return await this.api.getReposForUser(username);
    }

    async getChildItems(visId: string, path?: string): Promise<any[]> {
        console.log(
            `ReposProvider: Fetching repo details for ${visId}/${path || ''}`,
        );
        return await this.api.getDetailsForRepo(visId, path);
    }
}

// Keep the original class name for backward compatibility
export const NovemSideBarProvider = BaseNovemProvider;

export class NovemDummyProvider
    implements vscode.TreeDataProvider<vscode.TreeItem>
{
    constructor(private readonly context: vscode.ExtensionContext) {}

    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: MyTreeItem): Promise<vscode.TreeItem[]> {
        return [new vscode.TreeItem('Please log in')];
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

        // Determine the document type based on path and name
        let doctype = 'nv_markdown';

        // doctype overrides for certain files
        if (this.visType === 'jobs' && this.name === 'data') {
            doctype = 'json';
        } else if (this.name === 'custom.js') {
            doctype = 'javascript';
        } else if (this.name === 'custom.css') {
            doctype = 'css';
        } else if (this.name === 'custom.deps') {
            doctype = 'plaintext';
        }

        this.desc = ``;
        // Set the icon and its color based on type and permissions
        if (type === 'file') {
            this.desc = `[${this.permissionsToUnixStyle(this.permissions)}]`;
            this.command = {
                command: 'novem.openFile',
                title: 'Open File',
                arguments: [
                    this.visType === 'jobs'
                        ? `/jobs${this.path}`
                        : this.visType === 'repos'
                          ? `/repos${this.path}`
                          : `/${this.visType}${this.path}`,
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
            if (depth === 0 && this.visType === 'plots') {
                this.iconPath = this.createColoredIcon(
                    typeToIcon(iconType),
                    permissions,
                );
                this.contextValue = 'plot-top';
            }
            if (depth === 0 && this.visType === 'mails') {
                this.iconPath = this.createColoredIcon('mail', permissions);
                this.contextValue = 'mail-top';
            }
            if (depth === 0 && this.visType === 'jobs') {
                this.iconPath = this.createColoredIcon('run', permissions);
                this.contextValue = 'job-top';
            }
            if (depth === 0 && this.visType === 'repos') {
                this.iconPath = this.createColoredIcon('repo', permissions);
                this.contextValue = 'repo-top';
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

    tooltip = `${this.name} (${
        this.type
    }) - Permissions: ${this.permissions.join(', ')}`;

    private createColoredIcon(
        iconType: string,
        permissions: string[],
    ): vscode.ThemeIcon {
        console.log(
            `Creating icon for ${iconType} with permissions: ${permissions.join(', ')}`,
        );
        let color: vscode.ThemeColor | undefined = new vscode.ThemeColor(
            'terminal.ansiGreen',
        );

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
