import * as vscode from 'vscode';

import { UserConfig, UserProfile, typeToIcon } from './config';
import NovemApi from './novem-api';

export class NovemSideBarProvider
    implements vscode.TreeDataProvider<vscode.TreeItem>
{
    private context: vscode.ExtensionContext;
    private type: 'plots' | 'mails';
    private api: NovemApi;

    constructor(
        api: NovemApi,
        context: vscode.ExtensionContext,
        type: 'plots' | 'mails',
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
                    : this.api.getMailsForUser(profile.user_info.username!));

                return response
                    .sort((a: any, b: any) => {
                        // If types are the same, sort alphabetically by name
                        return a.id.localeCompare(b.id);
                    })
                    .map(
                        (each: any) =>
                            new MyTreeItem(
                                this,
                                each.id,
                                'dir',
                                ['r', 'd'],
                                this.type,
                                '',
                                each.type,
                            ),
                    );
            } catch (error) {
                console.error('Error!', error);
                return [new vscode.TreeItem('Error loading plots')];
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
                const response = await this.api.getDetailsForVis(
                    this.type,
                    visId,
                    path,
                );
                return response
                    .filter((each: any) => ['file', 'dir'].includes(each.type))
                    .sort((a: any, b: any) => {
                        // Sort by type first (directories come first)
                        if (a.type !== b.type) {
                            return a.type === 'dir' ? -1 : 1;
                        }
                        // If types are the same, sort alphabetically by name
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
                return [new vscode.TreeItem('Error loading plots')];
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

        const doctype = 'nv_markdown';
        this.desc = ``;
        // Set the icon and its color based on type and permissions
        if (type === 'file') {
            //this.iconPath = this.createColoredIcon('file', permissions);
            this.desc = `[${this.permissionsToUnixStyle(this.permissions)}]`;
            this.command = {
                command: 'novem.openFile',
                title: 'Open File',
                arguments: [`/${this.visType}${this.path}`, this.type, doctype],
            };
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
