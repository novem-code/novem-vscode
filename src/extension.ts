import * as vscode from 'vscode';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';

// Import the functions from config.ts
import { getCurrentConfig, UserProfile, getActiveProfile } from './config';
import {
    PlotsProvider,
    MailsProvider,
    JobsProvider,
    ReposProvider,
    NovemDummyProvider,
} from './tree';

import { setupCommands } from './commands';

import { NovemFSProvider } from './vfs';
import NovemApi from './novem-api';
import { createNovemBrowser } from './browser';
import { CacheWatcher } from './cache-watcher';

let plotsProvider: InstanceType<typeof PlotsProvider>;
let mailsProvider: InstanceType<typeof MailsProvider>;
let jobsProvider: InstanceType<typeof JobsProvider> | null = null;
let reposProvider: InstanceType<typeof ReposProvider> | null = null;

function doLogin() {
    // Get current profile settings to respect username and api_root
    const currentConfig = getCurrentConfig();
    const activeProfile = getActiveProfile();

    // Use current profile's api_root, or fall back to default
    const apiRoot = currentConfig?.api_root || 'https://api.novem.io/v1/';

    createNovemBrowser(
        'login',
        '',
        '',
        '/login',
        '',
        apiRoot,
        currentConfig?.username || undefined,
        activeProfile || undefined,
    );
}

export async function activate(context: vscode.ExtensionContext) {
    // Get our token from the user config
    const config = getCurrentConfig();

    if (!config) {
        vscode.commands.executeCommand('setContext', 'novem.loggedIn', false);
        doLogin();
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
        vscode.commands.executeCommand('setContext', 'novem.loggedIn', false);
        doLogin();

        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('novem-login', new NovemDummyProvider(context)),
        );

        return;
    }

    vscode.commands.executeCommand('setContext', 'novem.loggedIn', true);
    // Store user information
    context.globalState.update('userConfig', config);
    context.globalState.update('userProfile', profile);

    setupCommands(context, novemApi);

    // Set up local file cache so external tools (Claude Code, grep) can access novem files
    const cacheDir = path.join(context.globalStorageUri.fsPath, 'novem-cache');
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch (error) {
        console.error('Failed to create novem cache directory:', error);
    }

    const cacheWatcher = new CacheWatcher(cacheDir, async (novemPath, newContent) => {
        const shortPath = novemPath.replace(/^\//, '');
        const choice = await vscode.window.showInformationMessage(
            `"${shortPath}" was modified locally. Push changes to novem?`,
            'Push',
            'Diff',
            'Ignore',
        );

        if (choice === 'Push') {
            try {
                // Parse the novemPath to extract visType and subpath
                // Path format: /visType/visId/rest/of/path
                const parts = novemPath.split('/').filter(Boolean);
                const visType = parts[0];
                const subPath = '/' + parts.slice(1).join('/');
                await novemApi.writeFile(visType, subPath, newContent);
                cacheWatcher.updateKnownContent(novemPath, newContent);
                vscode.window.showInformationMessage(`Pushed ${shortPath} to novem`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to push ${shortPath}: ${error}`);
            }
        } else if (choice === 'Diff') {
            const cacheUri = vscode.Uri.file(
                path.join(cacheDir, ...novemPath.split('/').filter(Boolean)),
            );
            const parts = novemPath.split('/').filter(Boolean);
            const visType = parts[0];
            const subPath = '/' + parts.slice(1).join('/');
            const novemUri = vscode.Uri.from({
                scheme: 'novem',
                authority: visType,
                path: subPath,
            });
            vscode.commands.executeCommand(
                'vscode.diff',
                novemUri,
                cacheUri,
                `novem: ${shortPath} ↔ local`,
            );
        } else {
            // Ignore — revert cache to current API version
            try {
                const parts = novemPath.split('/').filter(Boolean);
                const visType = parts[0];
                const subPath = '/' + parts.slice(1).join('/');
                const apiContent = await novemApi.readFile(visType, subPath);
                if (apiContent !== undefined) {
                    const localPath = path.join(cacheDir, ...novemPath.split('/').filter(Boolean));
                    fs.writeFileSync(localPath, apiContent, 'utf-8');
                    cacheWatcher.updateKnownContent(novemPath, apiContent);
                }
            } catch {
                // best effort revert
            }
        }
    });

    cacheWatcher.start();
    context.subscriptions.push(new vscode.Disposable(() => cacheWatcher.stop()));

    const fsProvider = new NovemFSProvider(novemApi, cacheDir, cacheWatcher);
    const fsRegistration = vscode.workspace.registerFileSystemProvider('novem', fsProvider, {
        isCaseSensitive: true,
    });

    context.subscriptions.push(fsRegistration);

    // Track which local cached files map to novem paths
    const cachedFileToNovemPath = new Map<string, string>();

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.openFile',
            async (uri: vscode.Uri, type: string, languageId?: string) => {
                // Fetch content from API and write to cache
                const novemPath = `/${uri.authority}${uri.path}`;
                try {
                    const content = await novemApi.readFile(uri.authority, uri.path);
                    if (content !== undefined) {
                        const localPath = path.join(
                            cacheDir,
                            ...novemPath.split('/').filter(Boolean),
                        );
                        fs.mkdirSync(path.dirname(localPath), { recursive: true });
                        fs.writeFileSync(localPath, content, 'utf-8');
                        cacheWatcher.updateKnownContent(novemPath, content);
                        cachedFileToNovemPath.set(localPath, novemPath);
                    }
                } catch (error) {
                    console.error(`Failed to cache ${novemPath}:`, error);
                }

                // Open the cached local file
                const localPath = path.join(cacheDir, ...novemPath.split('/').filter(Boolean));
                const fileUri = vscode.Uri.file(localPath);
                let doc = await vscode.workspace.openTextDocument(fileUri);

                // If a languageId is provided, set the language for the document
                if (languageId) {
                    doc = await vscode.languages.setTextDocumentLanguage(doc, languageId);
                }

                vscode.window.showTextDocument(doc);
            },
        ),
    );

    // Intercept saves on cached files and push to novem API
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async doc => {
            const filePath = doc.uri.fsPath;
            const novemPath = cachedFileToNovemPath.get(filePath);
            if (!novemPath) return;

            try {
                const content = doc.getText();
                const parts = novemPath.split('/').filter(Boolean);
                const visType = parts[0];
                const subPath = '/' + parts.slice(1).join('/');
                await novemApi.writeFile(visType, subPath, content);
                if (cacheWatcher) {
                    cacheWatcher.updateKnownContent(novemPath, content);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to push ${novemPath} to novem: ${error}`);
            }
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
export { plotsProvider, mailsProvider, jobsProvider, reposProvider };
