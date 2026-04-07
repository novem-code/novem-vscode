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

/**
 * Extract the resource key (e.g. "plots/my_plot") from a novem path.
 * The path structure is: /visType/resourceId/...
 */
function getResourceKey(novemPath: string): string {
    const parts = novemPath.split('/').filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
    }
    return parts.join('/');
}

/**
 * Recursively fetch all files under a resource and write them to the cache.
 */
async function cacheResourceDirectory(
    api: NovemApi,
    visType: string,
    resourceId: string,
    cacheDir: string,
    cacheWatcher: CacheWatcher,
    cachedFileToNovemPath: Map<string, string>,
    dirPath?: string,
): Promise<void> {
    let entries: any[];
    try {
        if (visType === 'jobs') {
            entries = await api.getDetailsForJob(resourceId, dirPath);
        } else if (visType === 'repos') {
            entries = await api.getDetailsForRepo(resourceId, dirPath);
        } else {
            entries = await api.getDetailsForVis(visType as 'plots' | 'mails', resourceId, dirPath);
        }
    } catch {
        return;
    }

    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
        if (!entry.name) continue;
        const entryPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;

        if (entry.type === 'dir') {
            await cacheResourceDirectory(
                api,
                visType,
                resourceId,
                cacheDir,
                cacheWatcher,
                cachedFileToNovemPath,
                entryPath,
            );
        } else if (entry.type === 'file') {
            const novemPath = `/${visType}/${resourceId}/${entryPath}`;
            try {
                const content = await api.readFile(visType, `/${resourceId}/${entryPath}`);
                if (content !== undefined) {
                    const localPath = path.join(cacheDir, ...novemPath.split('/').filter(Boolean));
                    fs.mkdirSync(path.dirname(localPath), { recursive: true });
                    fs.writeFileSync(localPath, content, 'utf-8');
                    cacheWatcher.updateKnownContent(novemPath, content);
                    cachedFileToNovemPath.set(localPath, novemPath);
                }
            } catch {
                // Skip files we can't read
            }
        }
    }
}

/**
 * Get all open tab file paths that are inside the cache directory.
 */
function getOpenCachedFilePaths(cacheDir: string): string[] {
    const paths: string[] = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const uri = (tab.input as any)?.uri as vscode.Uri | undefined;
            if (uri && uri.scheme === 'file' && uri.fsPath.startsWith(cacheDir)) {
                paths.push(uri.fsPath);
            }
        }
    }
    return paths;
}

/**
 * Get the set of resource keys (e.g. "plots/my_plot") that have open tabs.
 */
function getOpenResourceKeys(cacheDir: string): Set<string> {
    const keys = new Set<string>();
    for (const filePath of getOpenCachedFilePaths(cacheDir)) {
        const relative = path.relative(cacheDir, filePath);
        const parts = relative.split(path.sep);
        if (parts.length >= 2) {
            keys.add(`${parts[0]}/${parts[1]}`);
        }
    }
    return keys;
}

/**
 * Remove cached directories for resources that have no open tabs.
 */
function cleanupStaleCache(cacheDir: string): void {
    const openKeys = getOpenResourceKeys(cacheDir);

    try {
        const visTypes = fs.readdirSync(cacheDir, { withFileTypes: true });
        for (const visDir of visTypes) {
            if (!visDir.isDirectory()) continue;
            const visPath = path.join(cacheDir, visDir.name);
            const resources = fs.readdirSync(visPath, { withFileTypes: true });

            for (const resDir of resources) {
                if (!resDir.isDirectory()) continue;
                const key = `${visDir.name}/${resDir.name}`;
                if (!openKeys.has(key)) {
                    fs.rmSync(path.join(visPath, resDir.name), { recursive: true, force: true });
                }
            }

            // Clean up empty visType directories
            const remaining = fs.readdirSync(visPath);
            if (remaining.length === 0) {
                fs.rmdirSync(visPath);
            }
        }
    } catch {
        // Cache dir may not exist yet
    }
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

    // If the user/profile changed since last activation, clear the entire cache
    // and close any open novem-cached tabs to avoid stale data
    const currentCacheIdentity = `${config.api_root}:${profile.user_info.username}`;
    const previousCacheIdentity = context.globalState.get<string>('novemCacheIdentity');
    if (previousCacheIdentity && previousCacheIdentity !== currentCacheIdentity) {
        // Close tabs pointing at cached files
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const uri = (tab.input as any)?.uri as vscode.Uri | undefined;
                if (uri && uri.scheme === 'file' && uri.fsPath.startsWith(cacheDir)) {
                    vscode.window.tabGroups.close(tab);
                }
            }
        }
        // Wipe the cache directory
        try {
            fs.rmSync(cacheDir, { recursive: true, force: true });
            fs.mkdirSync(cacheDir, { recursive: true });
        } catch {
            // best effort
        }
    }
    context.globalState.update('novemCacheIdentity', currentCacheIdentity);

    // Track which local cached files map to novem paths
    const cachedFileToNovemPath = new Map<string, string>();
    // Track which resources have been fully cached
    const cachedResources = new Set<string>();

    const cacheWatcher = new CacheWatcher(cacheDir, async (novemPath, newContent) => {
        const shortPath = novemPath.replace(/^\//, '');
        const parts = novemPath.split('/').filter(Boolean);
        const visType = parts[0];
        const subPath = '/' + parts.slice(1).join('/');

        try {
            await novemApi.writeFile(visType, subPath, newContent);
            cacheWatcher.updateKnownContent(novemPath, newContent);
            console.log(`Auto-pushed ${shortPath} to novem`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to push ${shortPath}: ${error}`);
        }
    });

    // On activation: clean up stale cache, re-seed from open tabs
    cleanupStaleCache(cacheDir);

    const openPaths = getOpenCachedFilePaths(cacheDir);
    if (openPaths.length > 0) {
        // Seed known content from files that are still open
        cacheWatcher.seedFromDisk(openPaths);

        // Rebuild cachedFileToNovemPath from open file paths
        for (const filePath of openPaths) {
            const relative = path.relative(cacheDir, filePath);
            const novemPath = '/' + relative.split(path.sep).join('/');
            cachedFileToNovemPath.set(filePath, novemPath);
        }

        // Mark open resources as cached and seed all their files
        for (const key of getOpenResourceKeys(cacheDir)) {
            cachedResources.add(key);
            const resourceDir = path.join(cacheDir, ...key.split('/'));
            cacheWatcher.seedDirectoryFromDisk(resourceDir);
        }
    }

    cacheWatcher.start();
    context.subscriptions.push(new vscode.Disposable(() => cacheWatcher.stop()));

    const fsProvider = new NovemFSProvider(novemApi, cacheDir, cacheWatcher);
    const fsRegistration = vscode.workspace.registerFileSystemProvider('novem', fsProvider, {
        isCaseSensitive: true,
    });

    context.subscriptions.push(fsRegistration);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.openFile',
            async (uri: vscode.Uri, type: string, languageId?: string) => {
                const novemPath = `/${uri.authority}${uri.path}`;
                const resourceKey = getResourceKey(novemPath);

                // Cache the entire resource directory on first access
                if (!cachedResources.has(resourceKey)) {
                    const parts = resourceKey.split('/');
                    await cacheResourceDirectory(
                        novemApi,
                        parts[0],
                        parts[1],
                        cacheDir,
                        cacheWatcher,
                        cachedFileToNovemPath,
                    );
                    cachedResources.add(resourceKey);
                }

                // Ensure the specific file is cached and up to date
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
            const filePath = doc.uri.fsPath;
            const novemPath = cachedFileToNovemPath.get(filePath);
            if (!novemPath) return;

            try {
                const content = doc.getText();
                const parts = novemPath.split('/').filter(Boolean);
                const visType = parts[0];
                const subPath = '/' + parts.slice(1).join('/');
                await novemApi.writeFile(visType, subPath, content);
                cacheWatcher.updateKnownContent(novemPath, content);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to push ${novemPath} to novem: ${error}`);
            }
        }),
    );

    // Clean up cached resource directories when all tabs for that resource are closed
    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs(event => {
            if (event.closed.length === 0) return;

            const openKeys = getOpenResourceKeys(cacheDir);

            for (const key of cachedResources) {
                if (!openKeys.has(key)) {
                    cachedResources.delete(key);
                    const resourceDir = path.join(cacheDir, ...key.split('/'));
                    try {
                        fs.rmSync(resourceDir, { recursive: true, force: true });
                        const parentDir = path.dirname(resourceDir);
                        const remaining = fs.readdirSync(parentDir);
                        if (remaining.length === 0) {
                            fs.rmdirSync(parentDir);
                        }
                    } catch {
                        // best effort cleanup
                    }

                    // Remove entries from cachedFileToNovemPath for this resource
                    const prefix = `/${key}`;
                    for (const [filePath, novemPath] of cachedFileToNovemPath) {
                        if (novemPath.startsWith(prefix)) {
                            cachedFileToNovemPath.delete(filePath);
                        }
                    }
                }
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
