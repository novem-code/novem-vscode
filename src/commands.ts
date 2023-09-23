/*
In this file we will implement a bunch of command to interact with the novem api.

There are two way to interact with commands, through the command pallette CTRL+SHIFT+P or through
context menus. (right click)

As far as i can tell this is mostly done with configuration in the package.json file, which is super
painful, but whatever.

To have a modicum of control over naming conventions in the different ways they are use we also have to 
create a bunch of duplicates and filter them in the package.json file...

Anyway, if someone has a better solution I'm ALL IN.

Below follows a list of commands that we should implement and their stauts

Command Pallete:
[ ] - View novem profile page (custom webview)

[ ] - Create novem plot by name
[ ] - Delete novem plot by name
[ ] - Edit novem plot by name (data file)
[ ] - View novem plot by name (custom webview of url)

[ ] - Create novem mail by name
[ ] - Delete novem mail by name
[ ] - Edit novem mail by name (content file)
[ ] - View novem mail by name (custom webview of url)


Context menu Plot Top level:
[ ] - Create
[ ] - Refresh           -- refresh the treeview

Context menu Plot:
[ ] - Open              -- in vscode (webview)
[ ] - Open (Browser)    -- run system command to open url

[ ] - Delete            -- delete plot

Context menu Mail:
[ ] - Open              -- in vscode webview)
[ ] - Open (Browser)    -- run system command to open url

[ ] - Send              -- Send e-mail
[ ] - Test (Mail)       -- Send test mail

[ ] - Delete            -- delete plot

*/

import axios from 'axios';
import * as vscode from 'vscode';

import { NovemSideBarProvider, MyTreeItem } from './tree';

export function setupCommands(context: vscode.ExtensionContext){


	let disposable = vscode.commands.registerCommand('novem.profile', () => {
		vscode.window.showInformationMessage('Hello World from novem!');

	});

	context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.commands.registerCommand('novem.createNovemPlot', async () => {
        // Handle the context menu action for the item
        
        let plotId = await vscode.window.showInputBox({
            prompt: 'Please provide the plot id to create:',
            placeHolder: 'test_plot_1',
            validateInput: (inputValue: string) => {
                if (!/^[a-z0-9_]+$/.test(inputValue)) {
                    return 'Only lowercase ASCII characters and underscores are allowed!';
                }
                return undefined;
            }
        });
        
        
        vscode.window.showInformationMessage(`Trying to create new novem plot ${plotId}`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('novem.deleteNovemPlot', async (item: MyTreeItem) => {
        // Handle the context menu action for the item
        
        let plotId  = await vscode.window.showInputBox({
            prompt: 'Enter a value:',
            placeHolder: 'e.g. john_doe',
            validateInput: (inputValue: string) => {
                if (!/^[a-z0-9_]+$/.test(inputValue)) {
                    return 'Only lowercase ASCII characters and underscores are allowed!';
                }
                return undefined;
            }
        });
        
        
        vscode.window.showInformationMessage(`Trying to delete ${plotId}`);
    }));

}
