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

import { BaseNovemProvider, MyTreeItem } from './tree';
import {
    UserConfig,
    UserProfile,
    VisInfo,
    typeToIcon,
    getAvailableProfiles,
    setActiveProfile,
    getCurrentConfig,
} from './config';
import { createNovemBrowser } from './browser';

import { mailsProvider, plotsProvider, jobsProvider, reposProvider } from './extension';
import NovemApi from './novem-api';

// Open a novem vis inside vscode
const createViewFunction = (
    context: vscode.ExtensionContext,
    api: NovemApi,
    type: 'plots' | 'mails' | 'login',
) => {
    const profile = context.globalState.get('userProfile') as UserProfile;
    const conf = context.globalState.get('userConfig') as UserConfig;
    const token = conf?.token;
    const apiRoot = conf?.api_root;

    const uname = profile?.user_info?.username;

    if (type === 'login') {
        return () =>
            void createNovemBrowser(type, '', '', '/login', '', apiRoot, undefined, undefined);
    }

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
            selectedItem = options.find((vis: QuickPickItem) => vis.description === item?.name) as
                | QuickPickItem
                | undefined;
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
            createNovemBrowser(type, visId, sn, uri, token, apiRoot, undefined, undefined);
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
            createNovemBrowser(type, visId, sn, uri, token, apiRoot, undefined, undefined);
        }
    };
};

export function setupCommands(context: vscode.ExtensionContext, api: NovemApi) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.logout',
            () =>
                void api.logout().then(d => {
                    console.log(d);
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }),
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('novem.login', createViewFunction(context, api, 'login')),
    );

    // Profile management commands
    context.subscriptions.push(
        vscode.commands.registerCommand('novem.selectProfile', async () => {
            const profiles = getAvailableProfiles();

            if (profiles.length === 0) {
                vscode.window.showWarningMessage('No profiles found in config file');
                return;
            }

            const selectedProfile = await vscode.window.showQuickPick(profiles, {
                placeHolder: 'Select a profile to switch to',
                title: 'Novem Profile Selection',
            });

            if (!selectedProfile) {
                return;
            }

            try {
                await setActiveProfile(selectedProfile);
                vscode.window.showInformationMessage(
                    `Switched to profile: ${selectedProfile}. Reloading window...`,
                );
                // Reload the window to apply the new profile
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to switch profile: ${error}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.loginNewProfile', () => {
            // Get current profile settings to respect api_root, but don't pre-fill username for new profile
            const currentConfig = getCurrentConfig();
            const apiRoot = currentConfig?.api_root || 'https://api.novem.io/v1/';

            createNovemBrowser(
                'login',
                '',
                '',
                '/login',
                '',
                apiRoot,
                undefined, // No username for new profile
                undefined, // No profile name - create new profile based on username
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.editConfig', async () => {
            try {
                const configPath = require('./config').getConfigPath();
                const configUri = vscode.Uri.file(configPath.config);

                // Open the config file in the editor
                const document = await vscode.workspace.openTextDocument(configUri);
                await vscode.window.showTextDocument(document);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open config file: ${error}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.reloadWindow', async () => {
            vscode.window.showInformationMessage('Reloading Novem extension...');
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }),
    );

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

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemMail', async () => {
            const profile = context.globalState.get('userProfile') as UserProfile;
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

            //console.log(`Create mail: "${plotId}"`);
            try {
                await api.createMail(plotId);
            } catch (error) {
                console.log('error', error);
                vscode.window.showErrorMessage(`Failed to create new mail ${plotId}`);
                return;
            }

            mailsProvider.refresh();

            vscode.window.showInformationMessage(`New mail ${plotId} created`);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemPlot', async () => {
            const profile = context.globalState.get('userProfile') as UserProfile;
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
            //console.log(`Create plot: "${plotId}"`);
            try {
                await api.createPlot(plotId);
            } catch (error) {
                console.log('error', error);
                vscode.window.showErrorMessage(`Failed to create new plot ${plotId}`);
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
        vscode.commands.registerCommand('novem.deleteNovemPlot', async (item: MyTreeItem) => {
            // Handle the context menu action for the item
            const profile = context.globalState.get('userProfile') as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

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
        }),
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

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemJob', async () => {
            const profile = context.globalState.get('userProfile') as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

            let jobId = await vscode.window.showInputBox({
                prompt: 'Please provide the job id to create:',
                placeHolder: 'test_job_1',
                validateInput: (inputValue: string) => {
                    if (!/^[a-z0-9_-]+$/.test(inputValue)) {
                        return 'Only lowercase ASCII characters, underscores, and hyphens are allowed!';
                    }
                    return undefined;
                },
            });

            if (!jobId) return;

            try {
                await api.createJob(jobId);
            } catch (error) {
                console.log('error', error);
                vscode.window.showErrorMessage(`Failed to create new job ${jobId}`);
                return;
            }

            jobsProvider?.refresh();

            vscode.window.showInformationMessage(`New job ${jobId} created`);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.deleteNovemJob', async (item: MyTreeItem) => {
            const profile = context.globalState.get('userProfile') as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

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
                    vscode.window.showInformationMessage(`Action aborted, job not deleted`);
                }
                return;
            }

            await api.deleteJob(item.name);

            vscode.window.showWarningMessage(`Deleted "${item.name}"`);
            item.parent.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemJobs', async () => {
            jobsProvider?.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemRepo', async () => {
            const profile = context.globalState.get('userProfile') as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

            let repoId = await vscode.window.showInputBox({
                prompt: 'Please provide the repo id to create:',
                placeHolder: 'test_repo_1',
                validateInput: (inputValue: string) => {
                    if (!/^[a-z0-9_-]+$/.test(inputValue)) {
                        return 'Only lowercase ASCII characters, underscores, and hyphens are allowed!';
                    }
                    return undefined;
                },
            });

            if (!repoId) return;

            try {
                await api.createRepo(repoId);
            } catch (error) {
                console.log('error', error);
                vscode.window.showErrorMessage(`Failed to create new repo ${repoId}`);
                return;
            }

            reposProvider?.refresh();

            vscode.window.showInformationMessage(`New repo ${repoId} created`);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.deleteNovemRepo', async (item: MyTreeItem) => {
            const profile = context.globalState.get('userProfile') as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

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
                    vscode.window.showInformationMessage(`Action aborted, repo not deleted`);
                }
                return;
            }

            await api.deleteRepo(item.name);

            vscode.window.showWarningMessage(`Deleted "${item.name}"`);
            item.parent.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemRepos', async () => {
            reposProvider?.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.cloneNovemRepo', async (item: MyTreeItem) => {
            if (!item || item.visType !== 'repos') {
                vscode.window.showErrorMessage('This command can only be used on repos');
                return;
            }

            try {
                // Fetch the clone URL from /repos/:repoId/url
                const cloneUrl = await api.readFile(`/repos/${item.name}/url`);

                if (!cloneUrl || typeof cloneUrl !== 'string') {
                    vscode.window.showErrorMessage(
                        `Failed to fetch clone URL for repo "${item.name}"`,
                    );
                    return;
                }

                // Prompt the user to select a directory to clone into
                const folderUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select Clone Location',
                    title: `Clone ${item.name}`,
                });

                if (!folderUri || folderUri.length === 0) {
                    return;
                }

                const parentPath = folderUri[0].fsPath;

                // Extract repo name from URL (handle both .git and non-.git URLs)
                const urlParts = cloneUrl.trim().split('/');
                const repoNameWithGit = urlParts[urlParts.length - 1];
                const repoName = repoNameWithGit.replace(/\.git$/, '');
                const clonePath = `${parentPath}/${repoName}`;

                // Show progress notification
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Cloning ${item.name}...`,
                        cancellable: false,
                    },
                    async progress => {
                        progress.report({ message: 'Running git clone...' });

                        // Use the built-in terminal to clone the repo
                        const terminal = vscode.window.createTerminal({
                            name: `Clone ${item.name}`,
                            cwd: parentPath,
                        });

                        terminal.show();
                        terminal.sendText(`git clone ${cloneUrl.trim()}`);
                    },
                );

                // Prompt user to open the cloned repository
                const openChoice = await vscode.window.showInformationMessage(
                    `Cloned ${item.name} into ${parentPath}`,
                    'Open Repository',
                    'Open in New Window',
                    'Cancel',
                );

                if (openChoice === 'Open Repository') {
                    await vscode.commands.executeCommand(
                        'vscode.openFolder',
                        vscode.Uri.file(clonePath),
                        false,
                    );
                } else if (openChoice === 'Open in New Window') {
                    await vscode.commands.executeCommand(
                        'vscode.openFolder',
                        vscode.Uri.file(clonePath),
                        true,
                    );
                }
            } catch (error) {
                console.error('Error cloning repo:', error);
                vscode.window.showErrorMessage(`Failed to clone repo "${item.name}": ${error}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNodeInDirectory', async (item: MyTreeItem) => {
            if (!item || item.type !== 'dir') {
                vscode.window.showErrorMessage('This command can only be used on directories');
                return;
            }

            if (!item.permissions.includes('w')) {
                vscode.window.showErrorMessage('This directory does not have write permissions');
                return;
            }

            // Determine validation rules based on parent directory
            const isSharedFolder = item.name === 'shared';
            const isTagsFolder = item.name === 'tags';

            let validationPattern: RegExp;
            let validationMessage: string;

            if (isSharedFolder) {
                // shared entries can contain @, +, ~, -, _
                validationPattern = /^[a-z0-9@+~_-]+$/;
                validationMessage =
                    'Only lowercase ASCII characters, numbers, @, +, ~, _, and - are allowed in shared folder!';
            } else if (isTagsFolder) {
                // tags may start with + and contain -, _
                validationPattern = /^\+?[a-z0-9_-]+$/;
                validationMessage =
                    'Tags may start with + and can contain lowercase ASCII characters, numbers, _, and -!';
            } else {
                // default validation
                validationPattern = /^[a-z0-9_.-]+$/;
                validationMessage =
                    'Only lowercase ASCII characters, numbers, underscores, dots, and hyphens are allowed!';
            }

            let nodeName = await vscode.window.showInputBox({
                prompt: `Enter the name of the node to create in ${item.name}:`,
                placeHolder: isTagsFolder ? '+tag_name' : 'node_name',
                validateInput: (inputValue: string) => {
                    if (!validationPattern.test(inputValue)) {
                        return validationMessage;
                    }
                    return undefined;
                },
            });

            if (!nodeName) return;

            // Construct the full path for the new node
            const fullPath =
                item.visType === 'jobs'
                    ? `/jobs${item.path}/${nodeName}`
                    : item.visType === 'repos'
                      ? `/repos${item.path}/${nodeName}`
                      : `/${item.visType}${item.path}/${nodeName}`;

            try {
                await api.createNodeInDirectory(fullPath);
                vscode.window.showInformationMessage(`Created node "${nodeName}" in ${item.name}`);
                item.parent.refresh();
            } catch (error) {
                console.error('Error creating node:', error);
                vscode.window.showErrorMessage(`Failed to create node "${nodeName}": ${error}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.deleteNode', async (item: MyTreeItem) => {
            if (!item) {
                vscode.window.showErrorMessage('No item selected');
                return;
            }

            if (!item.permissions.includes('d')) {
                vscode.window.showErrorMessage('This item does not have delete permissions');
                return;
            }

            const itemType = item.type === 'dir' ? 'directory' : 'file';
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete ${itemType} "${item.name}"?`,
                { modal: true },
                'Delete',
            );

            if (confirm !== 'Delete') {
                return;
            }

            // Construct the full path for the node to delete
            const fullPath =
                item.visType === 'jobs'
                    ? `/jobs${item.path}`
                    : item.visType === 'repos'
                      ? `/repos${item.path}`
                      : `/${item.visType}${item.path}`;

            try {
                await api.deleteNode(fullPath);
                vscode.window.showInformationMessage(`Deleted ${itemType} "${item.name}"`);
                item.parent.refresh();
            } catch (error) {
                console.error('Error deleting node:', error);
                vscode.window.showErrorMessage(
                    `Failed to delete ${itemType} "${item.name}": ${error}`,
                );
            }
        }),
    );
}
