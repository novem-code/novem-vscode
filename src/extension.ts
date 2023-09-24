import axios from 'axios';
import * as vscode from 'vscode';

// Import the functions from config.ts
import { getCurrentConfig, UserConfig } from './config';
import { NovemSideBarProvider, MyTreeItem } from './tree';

import { setupCommands } from './commands';

import { NovemFSProvider } from './vfs';

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

    console.debug('Read config', strippedConfig);

    const token = config?.token;

    const apiRoot = config?.api_root;

    // Let's grab our profile information
    const profile = (
        await axios.get(`${apiRoot}admin/profile/overview`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        })
    )?.data;

    console.log(profile);
    // Store user information
    context.globalState.update('userConfig', config);
    context.globalState.update('userProfile', profile);

    setupCommands(context);

    const fsProvider = new NovemFSProvider(context);
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

    vscode.window.registerTreeDataProvider(
        'novem-plots',
        new NovemSideBarProvider(context, 'plots'),
    );
    vscode.window.registerTreeDataProvider(
        'novem-mails',
        new NovemSideBarProvider(context, 'mails'),
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
