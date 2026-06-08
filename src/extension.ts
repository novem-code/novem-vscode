import * as vscode from 'vscode';
import * as https from 'https';

// Import the functions from config.ts
import { getCurrentConfig, UserProfile, getActiveProfile } from './config';
import {
    PlotsProvider,
    MailsProvider,
    GridsProvider,
    DocsProvider,
    JobsProvider,
    ReposProvider,
    NovemDummyProvider,
} from './tree';

import { setupCommands, setupAuthCommands } from './commands';

import { NovemFSProvider } from './vfs';
import NovemApi, { type VisAggregate } from './novem-api';
import { NovemUriHandler } from './oauth';

let plotsProvider: InstanceType<typeof PlotsProvider>;
let mailsProvider: InstanceType<typeof MailsProvider>;
let gridsProvider: InstanceType<typeof GridsProvider>;
let docsProvider: InstanceType<typeof DocsProvider>;
let jobsProvider: InstanceType<typeof JobsProvider> | null = null;
let reposProvider: InstanceType<typeof ReposProvider> | null = null;

type RootProvider = { primeRootItems(items: any[]): void };
type NovemTreeProvider = vscode.TreeDataProvider<vscode.TreeItem> & {
    attachTreeView(treeView: vscode.TreeView<vscode.TreeItem>): void;
};

function registerNovemTreeView(
    context: vscode.ExtensionContext,
    viewId: string,
    provider: NovemTreeProvider,
): void {
    const treeView = vscode.window.createTreeView(viewId, { treeDataProvider: provider });
    provider.attachTreeView(treeView);
    context.subscriptions.push(treeView);
}

function primeProviderRoot(
    aggregatePromise: Promise<VisAggregate | null>,
    key: keyof VisAggregate,
    provider: RootProvider | null | undefined,
): void {
    if (!provider) return;
    void aggregatePromise.then(aggregate => {
        if (aggregate) provider.primeRootItems(aggregate[key]);
    });
}

function primeProviderRootItems(
    itemsPromise: Promise<any[] | null>,
    provider: RootProvider | null | undefined,
): void {
    if (!provider) return;
    void itemsPromise.then(items => {
        if (items) provider.primeRootItems(items);
    });
}

// Re-fetch a single resource's subtree after we mutate its config (e.g. a plot
// type change can restructure the resource — new folders, etc.). Refreshing
// just the node keeps the rest of the tree (and the root list) untouched.
// External changes still need live events; handled later.
function refreshVisNode(visType: string, visId: string): void {
    switch (visType) {
        case 'plots':
            plotsProvider?.refreshResource(visId);
            break;
        case 'mails':
            mailsProvider?.refreshResource(visId);
            break;
        case 'grids':
            gridsProvider?.refreshResource(visId);
            break;
        case 'docs':
            docsProvider?.refreshResource(visId);
            break;
        case 'jobs':
            jobsProvider?.refreshResource(visId);
            break;
        case 'repos':
            reposProvider?.refreshResource(visId);
            break;
    }
}

function showLoggedOut(context: vscode.ExtensionContext) {
    vscode.commands.executeCommand('setContext', 'novem.loggedIn', false);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novem-login', new NovemDummyProvider(context)),
    );
}

export async function activate(context: vscode.ExtensionContext) {
    // Register the OAuth URI handler and auth commands unconditionally,
    // so the welcome action and OAuth callback work even without a token.
    context.subscriptions.push(vscode.window.registerUriHandler(new NovemUriHandler()));
    setupAuthCommands(context);

    const config = getCurrentConfig();

    // Set novem.loggedIn (optimistically, if we have a token) *before*
    // flipping novem.activated. The welcome view defaults to a loading
    // spinner until novem.activated is true, so this ordering takes the
    // user straight from "Loading…" to either the authenticated sidebar or
    // the "Sign in" prompt — never a flash of "Sign in" first.
    if (config) {
        vscode.commands.executeCommand('setContext', 'novem.loggedIn', true);
    }
    vscode.commands.executeCommand('setContext', 'novem.activated', true);

    if (!config) {
        showLoggedOut(context);
        return;
    }

    if (config?.ignore_ssl_warn) {
        https.globalAgent.options.rejectUnauthorized = false;
    }

    const novemApi = new NovemApi(config.api_root!, config.token!);
    const preloadUsername = config.username ?? '';
    const selfVisPromise = novemApi.getSelfVis(preloadUsername).catch(error => {
        console.error('Error preloading Novem sidebar root lists:', error);
        return null;
    });
    const jobsRootPromise = novemApi.getJobsForUser(preloadUsername).catch(error => {
        console.error('Error preloading Novem jobs root list:', error);
        return null;
    });
    const reposRootPromise = novemApi.getReposForUser(preloadUsername).catch(error => {
        console.error('Error preloading Novem repos root list:', error);
        return null;
    });

    // Let's grab our profile information
    let profile: UserProfile;
    try {
        profile = await novemApi.getProfile();
    } catch (e) {
        // bad token probably
        showLoggedOut(context);
        return;
    }
    // Store user information
    context.globalState.update('userConfig', config);
    context.globalState.update('userProfile', profile);

    setupCommands(context, novemApi);

    // Files are served live through the novem:// FileSystemProvider — readFile
    // fetches the single opened file from the API on demand, writeFile pushes it
    // back on save. No disk mirror or recursive prefetch.
    //
    // On save, a config change can restructure a resource (a plot type change
    // can add/remove folders, etc.), so re-fetch just that resource's subtree.
    // filePath is /<id>/<...>; the config segment is the trigger.
    const fsProvider = new NovemFSProvider(novemApi, (visType, filePath) => {
        if (!/(^|\/)config(\/|$)/.test(filePath)) return;
        const visId = filePath.split('/').filter(Boolean)[0];
        if (visId) refreshVisNode(visType, visId);
    });
    const fsRegistration = vscode.workspace.registerFileSystemProvider('novem', fsProvider, {
        isCaseSensitive: true,
    });

    context.subscriptions.push(fsRegistration);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.openFile',
            async (uri: vscode.Uri, type: string, languageId?: string) => {
                // Open the novem:// URI directly; the FS provider reads it live.
                let doc = await vscode.workspace.openTextDocument(uri);

                if (languageId) {
                    doc = await vscode.languages.setTextDocumentLanguage(doc, languageId);
                }

                await vscode.window.showTextDocument(doc, { preview: false });
            },
        ),
    );

    plotsProvider = new PlotsProvider(novemApi, context);
    mailsProvider = new MailsProvider(novemApi, context);
    gridsProvider = new GridsProvider(novemApi, context);
    docsProvider = new DocsProvider(novemApi, context);

    registerNovemTreeView(context, 'novem-plots', plotsProvider);
    registerNovemTreeView(context, 'novem-mails', mailsProvider);
    registerNovemTreeView(context, 'novem-grids', gridsProvider);
    registerNovemTreeView(context, 'novem-docs', docsProvider);

    primeProviderRoot(selfVisPromise, 'plots', plotsProvider);
    primeProviderRoot(selfVisPromise, 'mails', mailsProvider);
    primeProviderRoot(selfVisPromise, 'grids', gridsProvider);
    primeProviderRoot(selfVisPromise, 'docs', docsProvider);

    jobsProvider = new JobsProvider(novemApi, context);
    reposProvider = new ReposProvider(novemApi, context);

    registerNovemTreeView(context, 'novem-jobs', jobsProvider);
    registerNovemTreeView(context, 'novem-repos', reposProvider);

    primeProviderRootItems(jobsRootPromise, jobsProvider);
    primeProviderRootItems(reposRootPromise, reposProvider);
    vscode.commands.executeCommand('setContext', 'novem.hasJobs', true);
    vscode.commands.executeCommand('setContext', 'novem.hasRepos', true);

    const sbi = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);

    const activeProfile = getActiveProfile();
    const profileText = activeProfile ? ` [${activeProfile}]` : '';

    sbi.text = 'novem: ' + profile.user_info.email + profileText;
    sbi.tooltip = `Logged in as ${profile.user_info.name}${activeProfile ? ` (Profile: ${activeProfile})` : ''}`;
    sbi.command = 'novem.selectProfile';
    sbi.show();
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Export them if needed
export { plotsProvider, mailsProvider, gridsProvider, docsProvider, jobsProvider, reposProvider };
