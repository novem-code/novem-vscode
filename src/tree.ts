import axios from 'axios';
import * as vscode from 'vscode';

import { UserConfig } from './config';

export class NovemSideBarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private context: vscode.ExtensionContext;
    private type: string;
  
    constructor(context: vscode.ExtensionContext, type: string) {
        this.context = context;
        this.type = type;
    }

    async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }
  
    async getChildren(element?: MyTreeItem): Promise<vscode.TreeItem[]> {
        const conf = this.context.globalState.get('userConfig') as UserConfig;
        const token = conf?.token;
  
        if (!token) {
            return [new vscode.TreeItem("Please setup novem by running `novem --init`")];
        }

        // Determine the URL to fetch from
        let url = `https://api.novem.no/v1/vis/${this.type}`;
        if (element && element.type === 'dir') {
            url += `/${element.name}`;
        }

        try {
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Filter items by type and sort them
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
                .map((each: any) => new MyTreeItem(each.name, each.type, each.permissions));
        } catch (error) {
            console.error("Error!", error);
            return [new vscode.TreeItem("Error loading plots")];
        }
    }
}

class MyTreeItem extends vscode.TreeItem {
    constructor(
        public readonly name: string, 
        public readonly type: string, 
        public readonly permissions: string[]
    ) {
        super(name, type === 'dir' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        // Set the icon and its color based on type and permissions
        if (type === 'file') {
            this.iconPath = this.createColoredIcon('file', permissions);
        } else if (type === 'dir') {
            this.iconPath = this.createColoredIcon('folder', permissions);
        }
    }

    // This tooltip can be enhanced further
    tooltip = `${this.name} (${this.type}) - Permissions: ${this.permissions.join(', ')}`;
    description = this.type;

    private createColoredIcon(iconType: string, permissions: string[]): vscode.ThemeIcon {
        let color: vscode.ThemeColor | undefined;
        
        if (permissions.includes("w")) {
            color = new vscode.ThemeColor('terminal.ansiGreen');
        } else if (permissions.includes("r")) {
            color = new vscode.ThemeColor('terminal.ansiYellow');
        } else if (permissions.includes("d")) {
            color = new vscode.ThemeColor('terminal.ansiRed');
        }

        return new vscode.ThemeIcon(iconType, color);
    }
}
