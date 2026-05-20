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
    getActiveProfile,
    getCurrentConfig,
} from './config';
import { createNovemBrowser } from './browser';
import { startOAuthLogin } from './oauth';

const DEFAULT_API_ROOT = 'https://api.novem.io/v1/';

async function promptApiRoot(): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
        prompt: 'Novem API endpoint',
        value: DEFAULT_API_ROOT,
        validateInput: v => (v.trim() ? null : 'API endpoint cannot be empty'),
    });
    return value?.trim();
}

export function setupAuthCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        // Dual-mode: silent (welcome button passes [true]) vs interactive (palette).
        vscode.commands.registerCommand('novem.login', async (silent?: boolean) => {
            let apiRootOverride: string | undefined;
            if (!silent) {
                const entered = await promptApiRoot();
                if (entered === undefined) return;
                apiRootOverride = entered;
            }
            await startOAuthLogin({
                profileName: getActiveProfile() ?? undefined,
                apiRootOverride,
            });
        }),
        vscode.commands.registerCommand('novem.loginNewProfile', async () => {
            const profileName = await vscode.window.showInputBox({
                prompt: 'Profile name (leave blank to use your Novem username)',
                placeHolder: 'e.g. work, staging, personal',
            });
            if (profileName === undefined) return;
            const apiRoot = await promptApiRoot();
            if (apiRoot === undefined) return;
            await startOAuthLogin({
                profileName: profileName.trim() || undefined,
                apiRootOverride: apiRoot,
            });
        }),
        vscode.commands.registerCommand('novem.editConfig', async () => {
            try {
                const configPath = require('./config').getConfigPath();
                const configUri = vscode.Uri.file(configPath.config);
                const document = await vscode.workspace.openTextDocument(configUri);
                await vscode.window.showTextDocument(document);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open config file: ${error}`);
            }
        }),
    );
}

import { mailsProvider, plotsProvider, jobsProvider, reposProvider, novemCache } from './extension';
import NovemApi from './novem-api';

async function openCustomPlotFiles(plotName: string): Promise<void> {
    const filesToOpen = [
        { path: `/${plotName}/config/custom/custom.js`, lang: 'javascript' },
        { path: `/${plotName}/config/custom/custom.css`, lang: 'css' },
        { path: `/${plotName}/data`, lang: 'plaintext' },
    ];
    for (const file of filesToOpen) {
        try {
            await vscode.commands.executeCommand(
                'novem.openFile',
                vscode.Uri.from({
                    scheme: 'novem',
                    authority: 'plots',
                    path: file.path,
                }),
                'file',
                file.lang,
            );
        } catch {
            // File may not exist — skip silently
        }
    }
}

async function closeEditorsForItem(visType: string, itemName: string): Promise<void> {
    const prefix = `novem://${visType}/${itemName}`;
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const uri = (tab.input as any)?.uri as vscode.Uri | undefined;
            if (uri && uri.toString().startsWith(prefix)) {
                await vscode.window.tabGroups.close(tab);
            }
        }
    }
}

async function promptForId(
    prompt: string,
    placeholder: string,
    allowHyphens = false,
): Promise<string | undefined> {
    const pattern = allowHyphens ? /^[a-z0-9_-]+$/ : /^[a-z0-9_]+$/;
    const message = allowHyphens
        ? 'Only lowercase ASCII characters, underscores, and hyphens are allowed!'
        : 'Only lowercase ASCII characters and underscores are allowed!';
    return vscode.window.showInputBox({
        prompt,
        placeHolder: placeholder,
        validateInput: (inputValue: string) => (!pattern.test(inputValue) ? message : undefined),
    });
}

async function confirmDeletion(name: string, noun: string): Promise<boolean> {
    const confirm = await vscode.window.showInputBox({
        prompt: `Please confirm that you want to delete "${name}" by typing DELETE`,
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
            vscode.window.showInformationMessage(`Action aborted, ${noun} not deleted`);
        }
        return false;
    }
    return true;
}

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
            createNovemBrowser(type, visId, sn, uri, token, apiRoot, undefined);
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
            createNovemBrowser(type, visId, sn, uri, token, apiRoot, undefined);
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

            const mailId = await promptForId(
                'Please provide the mail id to create:',
                'test_mail_1',
            );
            if (!mailId) return;

            try {
                await api.createMail(mailId);
            } catch (error) {
                console.log('error', error);
                vscode.window.showErrorMessage(`Failed to create new mail ${mailId}`);
                return;
            }

            mailsProvider.refresh();

            vscode.window.showInformationMessage(`New mail ${mailId} created`);
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

            const plotTypes = [
                { label: 'custom', description: 'Custom visualization' },
                { label: 'bar', description: 'Bar chart' },
                { label: 'sbar', description: 'Stacked bar chart' },
                { label: 'gbar', description: 'Grouped bar chart' },
                { label: 'line', description: 'Line chart' },
            ];

            const type = await new Promise<string | undefined>(resolve => {
                const picker = vscode.window.createQuickPick();
                picker.items = plotTypes;
                picker.placeholder = 'Select or type a plot type';
                let accepted = false;
                picker.onDidAccept(() => {
                    accepted = true;
                    const value = picker.selectedItems[0]?.label || picker.value;
                    picker.hide();
                    resolve(value || undefined);
                });
                picker.onDidHide(() => {
                    picker.dispose();
                    if (!accepted) {
                        resolve(undefined);
                    }
                });
                picker.show();
            });

            if (!type) return;

            plotsProvider.setStatus(`Creating "${plotId}"...`);

            try {
                await api.createPlot(plotId);
            } catch (error) {
                console.log('error', error);
                plotsProvider.clearStatus();
                vscode.window.showErrorMessage(`Failed to create new plot ${plotId}`);
                return;
            }

            await api.modifyPlot(plotId, '/config/type', type);

            plotsProvider.clearStatus();
            plotsProvider.refresh();

            vscode.window.showInformationMessage(`New plot ${plotId} created`);

            // Auto-open key files for custom plots
            if (type === 'custom') {
                await openCustomPlotFiles(plotId);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.deleteNovemPlot', async (item: MyTreeItem) => {
            if (!(await confirmDeletion(item.name, 'visualisation'))) return;
            await api.deletePlot(item.name);
            await closeEditorsForItem('plots', item.name);
            vscode.window.showWarningMessage(`Deleted "${item.name}"`);
            item.parent.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.editCustomPlot', async (item: MyTreeItem) => {
            await openCustomPlotFiles(item.name);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemPlots', async () => {
            novemCache?.invalidateAndRefresh('plots');
            plotsProvider.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemMails', async () => {
            novemCache?.invalidateAndRefresh('mails');
            mailsProvider.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemJob', async () => {
            const profile = context.globalState.get('userProfile') as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

            const jobId = await promptForId(
                'Please provide the job id to create:',
                'test_job_1',
                true,
            );
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
            if (!(await confirmDeletion(item.name, 'job'))) return;
            await api.deleteJob(item.name);
            await closeEditorsForItem('jobs', item.name);
            vscode.window.showWarningMessage(`Deleted "${item.name}"`);
            item.parent.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemJobs', async () => {
            novemCache?.invalidateAndRefresh('jobs');
            jobsProvider?.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.createNovemRepo', async () => {
            const profile = context.globalState.get('userProfile') as UserProfile;
            const conf = context.globalState.get('userConfig') as UserConfig;

            const repoId = await promptForId(
                'Please provide the repo id to create:',
                'test_repo_1',
                true,
            );
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
            if (!(await confirmDeletion(item.name, 'repo'))) return;
            await api.deleteRepo(item.name);
            await closeEditorsForItem('repos', item.name);
            vscode.window.showWarningMessage(`Deleted "${item.name}"`);
            item.parent.refresh();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('novem.refreshNovemRepos', async () => {
            novemCache?.invalidateAndRefresh('repos');
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
                // Fetch the clone URL from the repos API
                const cloneUrl = await api.readFile('repos', `/${item.name}/url`);

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

            try {
                await api.createNodeInDirectory(item.visType, `${item.path}/${nodeName}`);
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

            try {
                await api.deleteNode(item.visType, item.path);
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
