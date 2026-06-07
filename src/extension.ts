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
import NovemApi from './novem-api';
import { NovemUriHandler } from './oauth';

let plotsProvider: InstanceType<typeof PlotsProvider>;
let mailsProvider: InstanceType<typeof MailsProvider>;
let gridsProvider: InstanceType<typeof GridsProvider>;
let docsProvider: InstanceType<typeof DocsProvider>;
let jobsProvider: InstanceType<typeof JobsProvider> | null = null;
let reposProvider: InstanceType<typeof ReposProvider> | null = null;

// Refresh a single resource type's tree. Used after we mutate a resource's
// config (e.g. plot type -> custom) so structural changes — new folders like
// config/custom, and the updated type/icon in the root list — show without a
// manual sidebar refresh. (External changes still need live events; later.)
function refreshTreeForType(visType: string): void {
    switch (visType) {
        case 'plots':
            plotsProvider?.refresh();
            break;
        case 'mails':
            mailsProvider?.refresh();
            break;
        case 'grids':
            gridsProvider?.refresh();
            break;
        case 'docs':
            docsProvider?.refresh();
            break;
        case 'jobs':
            jobsProvider?.refresh();
            break;
        case 'repos':
            reposProvider?.refresh();
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
    // On save, a config change can restructure a resource (changing a plot's
    // type to custom adds a config/custom folder) and changes its type in the
    // root list, so refetch that tree. Skip config/custom/* — those are content
    // edits (custom.js/css/deps), not structural, and save frequently.
    const fsProvider = new NovemFSProvider(novemApi, (visType, filePath) => {
        const isConfig = /(^|\/)config(\/|$)/.test(filePath);
        const isCustomContent = /(^|\/)config\/custom\//.test(filePath);
        if (isConfig && !isCustomContent) {
            refreshTreeForType(visType);
        }
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

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novem-plots', plotsProvider),
        vscode.window.registerTreeDataProvider('novem-mails', mailsProvider),
        vscode.window.registerTreeDataProvider('novem-grids', gridsProvider),
        vscode.window.registerTreeDataProvider('novem-docs', docsProvider),
    );

    // Check if jobs and repos endpoints are available by querying /code
    try {
        const codeRoot = await novemApi.getCodeRoot();
        const hasJobs = codeRoot.some((item: any) => item.name === 'jobs');
        const hasRepos = codeRoot.some((item: any) => item.name === 'repos');

        if (hasJobs) {
            jobsProvider = new JobsProvider(novemApi, context);
            context.subscriptions.push(
                vscode.window.registerTreeDataProvider('novem-jobs', jobsProvider),
            );
            vscode.commands.executeCommand('setContext', 'novem.hasJobs', true);
        } else {
            vscode.commands.executeCommand('setContext', 'novem.hasJobs', false);
        }

        if (hasRepos) {
            reposProvider = new ReposProvider(novemApi, context);
            context.subscriptions.push(
                vscode.window.registerTreeDataProvider('novem-repos', reposProvider),
            );
            vscode.commands.executeCommand('setContext', 'novem.hasRepos', true);
        } else {
            vscode.commands.executeCommand('setContext', 'novem.hasRepos', false);
        }
    } catch (error) {
        console.error('Error checking for jobs/repos endpoints:', error);
        vscode.commands.executeCommand('setContext', 'novem.hasJobs', false);
        vscode.commands.executeCommand('setContext', 'novem.hasRepos', false);
    }

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
