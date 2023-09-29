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

import * as vscode from 'vscode';

import { NovemSideBarProvider, MyTreeItem } from './tree';
import { UserConfig, UserProfile, VisInfo, typeToIcon } from './config';
import { createNovemBrowser } from './browser';

import { mailsProvider, plotsProvider } from './extension';
import NovemApi from './novem-api';

// Open a novem vis inside vscode
const createViewFunction = (
    context: vscode.ExtensionContext,
    api: NovemApi,
    type: 'plots' | 'mails',
) => {
    const profile = context.globalState.get('userProfile') as UserProfile;
    const conf = context.globalState.get('userConfig') as UserConfig;
    const token = conf?.token;
    const apiRoot = conf?.api_root;

    const uname = profile?.user_info?.username;

    return async (item: MyTreeItem) => {
        // Let's grab our profile information
        const visualisations = await (type === 'plots'
            ? api.getPlotsForUser(uname!)
            : api.getMailsForUser(uname!));

        const options = visualisations.map((item: VisInfo) => ({
            label: `$(${typeToIcon(item.type, type)}) ${item.name}`,
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

        let selectedItem: QuickPickItem | undefined = undefined;

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
            createNovemBrowser(visId, sn, uri, token, apiRoot);
        }
    };
};

// Open a novem vis inside vscode
const createViewForUserFunction = (
    context: vscode.ExtensionContext,
    api: NovemApi,
    type: 'plots' | 'mails',
) => {
    const profile = context.globalState.get('userProfile') as UserProfile;
    const conf = context.globalState.get('userConfig') as UserConfig;
    const token = conf?.token;
    const apiRoot = conf?.api_root;

    const uname = profile?.user_info?.username;

    return async () => {
        // Let's grab our profile information

        let username = await vscode.window.showInputBox({
            prompt: 'Please provide the @username to view:',
            placeHolder: '@novem_demo',
            validateInput: (inputValue: string) => {
                if (!/^@[a-z0-9_]+$/.test(inputValue)) {
                    return 'Username must start with @ and only lowercase alphanumeric characters and underscores are allowed!';
                }
                return undefined;
            },
        });

        let visualisations = [];
        username = username?.slice(1);

        try {
            visualisations = await (type === 'plots'
                ? api.getPlotsForUser(username!)
                : api.getMailsForUser(username!));
        } catch (error) {
            console.log('error', error);
            return;
        }

        const options = visualisations.map((item: VisInfo) => ({
            label: `$(${typeToIcon(item.type, type)}) ${item.name}`,
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

        let selectedItem: QuickPickItem | undefined = undefined;

        // Present choices
        selectedItem = (await vscode.window.showQuickPick(options, {
            placeHolder: 'Select an option...',
        })) as QuickPickItem | undefined;

        if (selectedItem) {
            let visId = selectedItem.description;
            let uri = uriMap[visId];
            let sn = snMap[visId];
            createNovemBrowser(visId, sn, uri, token, apiRoot);
        }
    };
};

export function setupCommands(context: vscode.ExtensionContext, api: NovemApi) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.viewNovemPlot',
            createViewFunction(context, api, 'plots'),
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.viewNovemMail',
            createViewFunction(context, api, 'mails'),
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.viewNovemPlotForUser',
            createViewForUserFunction(context, api, 'plots'),
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.viewNovemMailForUser',
            createViewForUserFunction(context, api, 'mails'),
        ),
    );

    let disposable = vscode.commands.registerCommand('novem.profile', () => {
        vscode.window.showInformationMessage('Hello World from novem!');
    });
    context.subscriptions.push(disposable);

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemMail', async () => {
            const profile = context.globalState.get(
                'userProfile',
            ) as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

            let plotId = await vscode.window.showInputBox({
                prompt: 'Please provide the mail id to create:',
                placeHolder: 'test_mail_1',
                validateInput: (inputValue: string) => {
                    if (!/^[a-z0-9_]+$/.test(inputValue)) {
                        return 'Only lowercase ASCII characters and underscores are allowed!';
                    }
                    return undefined;
                },
            });

            if (!plotId) return;

            console.log(`Create mail: "${plotId}"`);
            try {
                await api.createMail(plotId);
            } catch (error) {
                console.log('error', error);
                vscode.window.showErrorMessage(
                    `Failed to create new mail ${plotId}`,
                );
                return;
            }

            mailsProvider.refresh();

            vscode.window.showInformationMessage(`New mail ${plotId} created`);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemPlot', async () => {
            const profile = context.globalState.get(
                'userProfile',
            ) as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

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

            if (!plotId) return;

            let type = await vscode.window.showInputBox({
                prompt: 'Please specify the type of plot to create:',
                placeHolder: 'bar',
                validateInput: (inputValue: string) => {
                    if (!/^[a-z]+$/.test(inputValue)) {
                        return 'Only lowercase ASCII characters are allowed!';
                    }
                    return undefined;
                },
            });

            if (!type) type = 'bar';

            let url = `${conf.api_root}vis/plots/${plotId}`;
            console.log(`Create plot: "${plotId}"`);
            try {
                await api.createPlot(plotId);
            } catch (error) {
                console.log('error', error);
                vscode.window.showErrorMessage(
                    `Failed to create new plot ${plotId}`,
                );
                return;
            }

            await api.modifyPlot(plotId, '/config/type', type);
            //item.parent.refresh();

            plotsProvider.refresh();

            vscode.window.showInformationMessage(`New plot ${plotId} created`);
            // let's refresh our plot treeview
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

                await api.deletePlot(item.name);

                vscode.window.showWarningMessage(`Deleted "${item.name}"`);
                item.parent.refresh();
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemPlots', async () => {
            plotsProvider.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemMails', async () => {
            mailsProvider.refresh();
        }),
    );
}
