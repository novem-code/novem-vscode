import axios from 'axios';
import * as vscode from 'vscode';

import { UserConfig, UserProfile, typeToIcon } from './config';

export class NovemSideBarProvider
    implements vscode.TreeDataProvider<vscode.TreeItem>
{
    private context: vscode.ExtensionContext;
    private type: string;

    constructor(context: vscode.ExtensionContext, type: string) {
        this.context = context;
        this.type = type;
    }

    // implement onDidChangeTreeData
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
        const conf = this.context.globalState.get('userConfig') as UserConfig;
        const profile = this.context.globalState.get(
            'userProfile',
        ) as UserProfile;
        const token = conf?.token;
        const apiRoot = conf?.api_root;

        if (!token) {
            return [
                new vscode.TreeItem(
                    'Please setup novem by running `novem --init`',
                ),
            ];
        }

        // Determine the URL to fetch from
        let url = `${apiRoot}vis/${this.type}`;
        if (element && element.type === 'dir') {
            url += element.path; // Use the full path stored in the MyTreeItem
        }

        if (!element) {
            if (this.type == 'plots') {
                url = `${apiRoot}u/${profile?.user_info?.username}/p/`;
            }

            try {
                const response = await axios.get(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                return response.data.map(
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
            try {
                const response = await axios.get(url, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                return response.data
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

        const doctype = 'markdown';
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
