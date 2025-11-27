import * as vscode from 'vscode';

import { UserConfig, UserProfile, typeToIcon, getActiveProfile } from './config';
import NovemApi from './novem-api';

export class NovemSideBarProvider
    implements vscode.TreeDataProvider<vscode.TreeItem>
{
    private context: vscode.ExtensionContext;
    private type: 'plots' | 'mails' | 'jobs' | 'repos';
    private api: NovemApi;

    constructor(
        api: NovemApi,
        context: vscode.ExtensionContext,
        type: 'plots' | 'mails' | 'jobs' | 'repos',
    ) {
        this.api = api;
        this.context = context;
        this.type = type;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        MyTreeItem | undefined | null | void
    > = new vscode.EventEmitter<MyTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        MyTreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: MyTreeItem): Promise<vscode.TreeItem[]> {
        const profile = this.context.globalState.get(
            'userProfile',
        ) as UserProfile;

        // Determine the URL to fetch from
        if (!element) {
            try {
                const response = await (this.type === 'plots'
                    ? this.api.getPlotsForUser(profile.user_info.username!)
                    : this.type === 'mails'
                      ? this.api.getMailsForUser(profile.user_info.username!)
                      : this.type === 'jobs'
                        ? this.api.getJobsForUser(profile.user_info.username!)
                        : this.api.getReposForUser(profile.user_info.username!));

                return response
                    .sort((a: any, b: any) => {
                        // If types are the same, sort alphabetically by name
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
                                ['r', 'd'],
                                this.type,
                                '',
                                each.type || this.type === 'jobs' ? 'job' : 'repo',
                            ),
                    );
            } catch (error) {
                console.error('Error!', error);
                return [new vscode.TreeItem(`Error loading ${this.type}`)];
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
                const response =
                    this.type === 'jobs'
                        ? await this.api.getDetailsForJob(visId, path)
                        : this.type === 'repos'
                          ? await this.api.getDetailsForRepo(visId, path)
                          : await this.api.getDetailsForVis(
                                this.type,
                                visId,
                                path,
                            );
                return response
                    .filter((each: any) => ['file', 'dir', 'link'].includes(each.type))
                    .sort((a: any, b: any) => {
                        // Directories come first, then files and links together
                        const aIsDir = a.type === 'dir';
                        const bIsDir = b.type === 'dir';

                        if (aIsDir && !bIsDir) return -1;
                        if (!aIsDir && bIsDir) return 1;

                        // Within the same group, sort alphabetically by name
                        return a.name.localeCompare(b.name);
                    })
                    .map(
                        (each: any) =>
                            new MyTreeItem(
                                this,
                                each.name,
                                each.type,
                                each.permissions,
                                this.type,
                                element ? element.path : '',
                                '',
                            ),
                    );
            } catch (error) {
                console.error('Error!', error);
                return [new vscode.TreeItem(`Error loading ${this.type}`)];
            }
        }
    }
}

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
    public readonly path: string; // Store the full path here
    public readonly desc: string;

    constructor(
        public readonly parent: NovemSideBarProvider,
        public readonly name: string,
        public readonly type: string,
        public readonly permissions: string[],
        public readonly visType: string,
        parentPath: string = '', // Parent's path, empty for root items
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
            //this.iconPath = this.createColoredIcon('file', permissions);
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

            // Set contextValue for deletable files
            if (permissions.includes('d')) {
                this.contextValue = 'file-deletable';
            }
        } else if (type === 'link') {
            // Handle links (similar to files but with a link icon)
            this.iconPath = new vscode.ThemeIcon('link');
            this.desc = `[${this.permissionsToUnixStyle(this.permissions)}]`;

            // Set contextValue for deletable links
            if (permissions.includes('d')) {
                this.contextValue = 'file-deletable';
            }
        } else if (type === 'dir') {
            if (depth === 0 && this.visType === 'plots') {
                this.iconPath = this.createColoredIcon(
                    typeToIcon(iconType),
                    permissions,
                );
                this.contextValue = 'plot-top'; // Add this line
            }
            if (depth === 0 && this.visType === 'mails') {
                this.iconPath = this.createColoredIcon('mail', permissions);
                this.contextValue = 'mail-top'; // Add this line
            }
            if (depth === 0 && this.visType === 'jobs') {
                this.iconPath = this.createColoredIcon('run', permissions);
                this.contextValue = 'job-top'; // Add this line
            }
            if (depth === 0 && this.visType === 'repos') {
                this.iconPath = this.createColoredIcon('repo', permissions);
                this.contextValue = 'repo-top'; // Add this line
            }

            // Set contextValue for writable/deletable directories (not top-level)
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
            //this.iconPath = this.createColoredIcon('folder', permissions);
        }

        this.description = this.desc;
    }

    // This tooltip can be enhanced further
    tooltip = `${this.name} (${
        this.type
    }) - Permissions: ${this.permissions.join(', ')}`;
    //description = this.type;

    private createColoredIcon(
        iconType: string,
        permissions: string[],
    ): vscode.ThemeIcon {
        let color: vscode.ThemeColor | undefined;

        if (permissions.includes('w')) {
            color = new vscode.ThemeColor('terminal.ansiGreen');
        } else if (permissions.includes('r')) {
            color = new vscode.ThemeColor('terminal.ansiYellow');
        } else if (permissions.includes('d')) {
            color = new vscode.ThemeColor('terminal.ansiRed');
        }

        color = new vscode.ThemeColor('terminal.ansiGreen');
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
