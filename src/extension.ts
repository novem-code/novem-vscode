import * as vscode from 'vscode';
import * as https from 'https';
import * as path from 'path';

// Import the functions from config.ts
import { getCurrentConfig, UserProfile, getActiveProfile } from './config';
import {
    PlotsProvider,
    MailsProvider,
    JobsProvider,
    ReposProvider,
    NovemDummyProvider,
} from './tree';

import { setupCommands, setupAuthCommands } from './commands';

import { NovemFSProvider } from './vfs';
import NovemApi from './novem-api';
import { NovemCache } from './cache';
import { NovemUriHandler } from './oauth';

let plotsProvider: InstanceType<typeof PlotsProvider>;
let mailsProvider: InstanceType<typeof MailsProvider>;
let jobsProvider: InstanceType<typeof JobsProvider> | null = null;
let reposProvider: InstanceType<typeof ReposProvider> | null = null;
let novemCache: NovemCache | null = null;

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

    // Set up local file cache
    const cacheDir = path.join(context.globalStorageUri.fsPath, 'novem-cache');
    novemCache = new NovemCache(cacheDir, novemApi);

    // If the user/profile changed since last activation, clear the entire cache
    const currentCacheIdentity = `${config.api_root}:${profile.user_info.username}`;
    const previousCacheIdentity = context.globalState.get<string>('novemCacheIdentity');
    if (previousCacheIdentity && previousCacheIdentity !== currentCacheIdentity) {
        novemCache.reset();
    }
    context.globalState.update('novemCacheIdentity', currentCacheIdentity);

    novemCache.activate(context);

    const fsProvider = new NovemFSProvider(novemApi, novemCache);
    const fsRegistration = vscode.workspace.registerFileSystemProvider('novem', fsProvider, {
        isCaseSensitive: true,
    });

    context.subscriptions.push(fsRegistration);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.openFile',
            async (uri: vscode.Uri, type: string, languageId?: string) => {
                if (!novemCache) return;

                // Cache the entire resource directory on first access
                await novemCache.ensureResourceCached(uri.authority, uri.path.split('/')[1]);

                // Fetch the specific file (may be newer than directory cache)
                await novemCache.cacheFile(uri.authority, uri.path);

                // Open the cached local file
                const localPath = novemCache.getLocalPath(uri.authority, uri.path);
                const fileUri = vscode.Uri.file(localPath);
                let doc = await vscode.workspace.openTextDocument(fileUri);

                if (languageId) {
                    doc = await vscode.languages.setTextDocumentLanguage(doc, languageId);
                }

                await vscode.window.showTextDocument(doc, { preview: false });
            },
        ),
    );

    // Intercept saves on cached files and push to novem API
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async doc => {
            if (!novemCache) return;
            await novemCache.pushFile(doc.uri.fsPath, doc.getText());
        }),
    );

    plotsProvider = new PlotsProvider(novemApi, context);
    mailsProvider = new MailsProvider(novemApi, context);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novem-plots', plotsProvider),
        vscode.window.registerTreeDataProvider('novem-mails', mailsProvider),
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
export { plotsProvider, mailsProvider, jobsProvider, reposProvider, novemCache };
