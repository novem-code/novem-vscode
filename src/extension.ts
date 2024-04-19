import * as vscode from 'vscode';
import * as https from 'https';

// Import the functions from config.ts
import { getCurrentConfig, UserProfile } from './config';
import { NovemSideBarProvider, NovemDummyProvider } from './tree';

import { setupCommands } from './commands';

import { NovemFSProvider } from './vfs';
import NovemApi from './novem-api';
import { createNovemBrowser } from './browser';

let plotsProvider: NovemSideBarProvider;
let mailsProvider: NovemSideBarProvider;

function doLogin() {
    createNovemBrowser(
        'login',
        '',
        '',
        '/login',
        '',
        'https://api.novem.no/v1/', // pull this from settings?
        false,
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

    plotsProvider = new NovemSideBarProvider(novemApi, context, 'plots');
    mailsProvider = new NovemSideBarProvider(novemApi, context, 'mails');

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novem-plots', plotsProvider),
        vscode.window.registerTreeDataProvider('novem-mails', mailsProvider),
    );

    const sbi = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        50,
    );

    sbi.text = 'novem: ' + profile.user_info.email;
    sbi.tooltip = 'Logged in as ' + profile.user_info.name;
    sbi.show();
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Export them if needed
export { plotsProvider, mailsProvider };
