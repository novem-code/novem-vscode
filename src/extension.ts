import * as vscode from 'vscode';
import * as https from 'https';

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

let plotsProvider: PlotsProvider;
let mailsProvider: MailsProvider;
let jobsProvider: JobsProvider | null = null;
let reposProvider: ReposProvider | null = null;

function doLogin() {
    createNovemBrowser(
        'login',
        '',
        '',
        '/login',
        '',
        'https://api.novem.io/v1/', // pull this from settings?
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
            vscode.window.registerTreeDataProvider(
                'novem-login',
                new NovemDummyProvider(context),
            ),
        );

        return;
    }

    vscode.commands.executeCommand('setContext', 'novem.loggedIn', true);
    // Store user information
    context.globalState.update('userConfig', config);
    context.globalState.update('userProfile', profile);

    setupCommands(context, novemApi);

    const fsProvider = new NovemFSProvider(novemApi);
    const fsRegistration = vscode.workspace.registerFileSystemProvider(
        'novem',
        fsProvider,
        { isCaseSensitive: true },
    );

    context.subscriptions.push(fsRegistration);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'novem.openFile',
            async (path: string, type: string, languageId?: string) => {
                const uri = vscode.Uri.parse(`novem:${path}`);
                let doc = await vscode.workspace.openTextDocument(uri);

                // If a languageId is provided, set the language for the document
                if (languageId) {
                    doc = await vscode.languages.setTextDocumentLanguage(
                        doc,
                        languageId,
                    );
                }

                vscode.window.showTextDocument(doc);
            },
        ),
    );

    plotsProvider = new PlotsProvider(novemApi, context);
    mailsProvider = new MailsProvider(novemApi, context);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novem-plots', plotsProvider),
        vscode.window.registerTreeDataProvider('novem-mails', mailsProvider),
    );

    // Check if jobs and repos endpoints are available by querying the API root
    try {
        const apiRoot = await novemApi.getApiRoot();
        const hasJobs = apiRoot.some((item: any) => item.name === 'jobs');
        const hasRepos = apiRoot.some((item: any) => item.name === 'repos');

        if (hasJobs) {
            jobsProvider = new JobsProvider(novemApi, context);
            context.subscriptions.push(
                vscode.window.registerTreeDataProvider(
                    'novem-jobs',
                    jobsProvider,
                ),
            );
            vscode.commands.executeCommand('setContext', 'novem.hasJobs', true);
        } else {
            vscode.commands.executeCommand(
                'setContext',
                'novem.hasJobs',
                false,
            );
        }

        if (hasRepos) {
            reposProvider = new ReposProvider(novemApi, context);
            context.subscriptions.push(
                vscode.window.registerTreeDataProvider(
                    'novem-repos',
                    reposProvider,
                ),
            );
            vscode.commands.executeCommand(
                'setContext',
                'novem.hasRepos',
                true,
            );
        } else {
            vscode.commands.executeCommand(
                'setContext',
                'novem.hasRepos',
                false,
            );
        }
    } catch (error) {
        console.error('Error checking for jobs/repos endpoints:', error);
        vscode.commands.executeCommand('setContext', 'novem.hasJobs', false);
        vscode.commands.executeCommand('setContext', 'novem.hasRepos', false);
    }

    const sbi = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        50,
    );

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
