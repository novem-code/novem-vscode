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
import { UserConfig, UserProfile, VisInfo, typeToIcon } from './config';
import { createNovemBrowser } from './browser';

// Open a novem vis inside vscode
const createViewFunction = (context: vscode.ExtensionContext, type: String) => {
    const profile = context.globalState.get('userProfile') as UserProfile;
    const conf = context.globalState.get('userConfig') as UserConfig;
    const token = conf?.token;
    const apiRoot = conf?.api_root;

    const uname = profile?.user_info?.username;
    const pt = type[0];

    return async (item: MyTreeItem) => {
        // Let's grab our profile information
        const visualisations = (
            await axios.get(`${apiRoot}u/${uname}/${pt}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            })
        )?.data;

        const options = visualisations.map((item: VisInfo) => ({
            label: `$(${typeToIcon(item.type, pt)}) ${item.name}`,
            description: item.id,
            detail: item.summary,
        }));

        interface QuickPickItem {
            label: string;
            description: string;
            detail: string;
            // ... any other properties you expect ...
        }

        const uriMap: { [key: string]: string } = visualisations.reduce(
            (acc: { [key: string]: string }, item: VisInfo) => {
                acc[item.id] = item.uri;
                return acc;
            },
            {},
        );

        const snMap: { [key: string]: string } = visualisations.reduce(
            (acc: { [key: string]: string }, item: VisInfo) => {
                acc[item.id] = item.shortname;
                return acc;
            },
            {},
        );

        let selectedItem = undefined;

        if (item) {
            selectedItem = options.find(
                (vis: QuickPickItem) => vis.description === item?.name,
            ) as QuickPickItem | undefined;
        } else {
            // Present choices
            selectedItem = (await vscode.window.showQuickPick(options, {
                placeHolder: 'Select an option...',
            })) as QuickPickItem | undefined;
        }

        if (selectedItem) {
            let visId = selectedItem.description;
            let uri = uriMap[visId];
            let sn = snMap[visId];
            createNovemBrowser(visId, sn, uri);
        }
    };
};

const createPlot = (token: String, plotId: String) => {
    console.log(`Creating new plot ${plotId}`);
};

export function setupCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.viewNovemPlot',
            createViewFunction(context, 'plots'),
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.viewNovemMail',
            createViewFunction(context, 'mails'),
        ),
    );

    let disposable = vscode.commands.registerCommand('novem.profile', () => {
        vscode.window.showInformationMessage('Hello World from novem!');
    });
    context.subscriptions.push(disposable);

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemPlot', async () => {
            // Handle the context menu action for the item

            let plotId = await vscode.window.showInputBox({
                prompt: 'Please provide the plot id to create:',
                placeHolder: 'test_plot_1',
                validateInput: (inputValue: string) => {
                    if (!/^[a-z0-9_]+$/.test(inputValue)) {
                        return 'Only lowercase ASCII characters and underscores are allowed!';
                    }
                    return undefined;
                },
            });

            vscode.window.showInformationMessage(
                `Trying to create new novem plot ${plotId}`,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.deleteNovemPlot',
            async (item: MyTreeItem) => {
                // Handle the context menu action for the item
                const profile = context.globalState.get(
                    'userProfile',
                ) as UserProfile;
                const conf = context.globalState.get(
                    'userConfig',
                ) as UserConfig;

                let confirm = await vscode.window.showInputBox({
                    prompt: `Please confirm that you want to delete "${item.name}" by typing DELETE`,
                    placeHolder: 'type DELETE here',
                    validateInput: (inputValue: string) => {
                        if (!/^[DELETE]+$/.test(inputValue)) {
                            return 'Only uppercase DELETE allowed, hit escape to ABORT';
                        }
                        return undefined;
                    },
                });

                if (confirm !== 'DELETE') {
                    if (confirm !== undefined) {
                        vscode.window.showInformationMessage(
                            `Action aborted, visualisation not deleted`,
                        );
                    }
                    return;
                }

                await axios.delete(`${conf.api_root}vis/plots/${item.name}`, {
                    headers: {
                        Authorization: `Bearer ${conf.token}`,
                        Accept: 'application/json',
                    },
                });

                vscode.window.showWarningMessage(`Deleted "${item.name}"`);
                item.parent.refresh();
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.deleteNovemPlotCtxt',
            async (item: MyTreeItem) => {
                // Handle the context menu action for the item

                const plotId = item.name;

                vscode.window.showInformationMessage(
                    `Trying to delete ${plotId}`,
                );
            },
        ),
    );
}
