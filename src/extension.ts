import * as vscode from 'vscode';
import * as https from 'https';

// Import the functions from config.ts
import { getCurrentConfig, UserConfig } from './config';
import { NovemSideBarProvider, MyTreeItem } from './tree';

import { setupCommands } from './commands';

import { NovemFSProvider } from './vfs';
import NovemApi from './novem-api';

// At the top of your module
let plotsProvider: NovemSideBarProvider;
let mailsProvider: NovemSideBarProvider;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated

    // Get our token from the user config
    const config = getCurrentConfig();

    if (!config) {
        // make a warning dialog
        vscode.window.showWarningMessage(
            'Novem is not configured. Please configure it first.',
        );
        return;
    }

    const strippedConfig = { ...config };
    delete strippedConfig.token;

    if (config?.ignore_ssl_warn) {
        https.globalAgent.options.rejectUnauthorized = false;
    }

    // console.debug('Read config', strippedConfig);

    const token = config.token;

    const apiRoot = config.api_root;

    const novemApi = new NovemApi(apiRoot!, token!);

    // Let's grab our profile information
    const profile = await novemApi.getProfile();

    console.log(profile);

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

    const sbi = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        50,
    );

    sbi.text = 'novem: ' + profile.user_info.email;
    sbi.show();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novem-plots', plotsProvider),
        vscode.window.registerTreeDataProvider('novem-mails', mailsProvider),
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Export them if needed
export { plotsProvider, mailsProvider };
