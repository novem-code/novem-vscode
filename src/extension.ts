import axios from 'axios';
import * as vscode from 'vscode';

// Import the functions from config.ts
import { getCurrentConfig, UserConfig } from './config';
import { NovemSideBarProvider, MyTreeItem } from './tree';

import { NovemFSProvider } from './vfs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "novem-vscode" is now active!');

  // Get our token from the user config
  const [confExists, conf] = await getCurrentConfig();
  const token = conf?.token;

  // Let's grab our profile information
  const profile = (await axios
  .get("https://api.novem.no/v1/admin/profile/overview", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'

    },
  }))?.data;

  // Store user information
  context.globalState.update('userConfig', conf);
  context.globalState.update('userProfile', profile);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('novem-vscode.profile', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from novem-vscode!');

	});

	context.subscriptions.push(disposable);

    context.subscriptions.push(vscode.commands.registerCommand('novem-vscode.createNovemPlot', async () => {
        // Handle the context menu action for the item
        
        let plotId = await vscode.window.showInputBox({
            prompt: 'Please provide the plot id to create:',
            placeHolder: 'test_plot_1',
            validateInput: (inputValue: string) => {
                if (!/^[a-z0-9_]+$/.test(inputValue)) {
                    return 'Only lowercase ASCII characters and underscores are allowed!';
                }
                return undefined;
            }
        });
        
        
        vscode.window.showInformationMessage(`Trying to create new novem plot ${plotId}`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('novem-vscode.deleteNovemPlot', async (item: MyTreeItem) => {
        // Handle the context menu action for the item
        
        let plotId  = await vscode.window.showInputBox({
            prompt: 'Enter a value:',
            placeHolder: 'e.g. john_doe',
            validateInput: (inputValue: string) => {
                if (!/^[a-z0-9_]+$/.test(inputValue)) {
                    return 'Only lowercase ASCII characters and underscores are allowed!';
                }
                return undefined;
            }
        });
        
        
        vscode.window.showInformationMessage(`Trying to delete ${plotId}`);
    }));


    const fsProvider = new NovemFSProvider(context);
    const fsRegistration = vscode.workspace.registerFileSystemProvider('novem', fsProvider, { isCaseSensitive: true });

    context.subscriptions.push(fsRegistration);

  
    context.subscriptions.push(vscode.commands.registerCommand('novem-vscode.openFile', async (path: string, type: string, languageId?: string) => {
        const uri = vscode.Uri.parse(`novem:${path}`);
        let doc = await vscode.workspace.openTextDocument(uri);

        // If a languageId is provided, set the language for the document
        if (languageId) {
            doc = await vscode.languages.setTextDocumentLanguage(doc, languageId);
        }

        vscode.window.showTextDocument(doc);
    }));

   


	vscode.window.registerTreeDataProvider('novem-plots', new NovemSideBarProvider(context, 'plots'));
    vscode.window.registerTreeDataProvider('novem-mails', new NovemSideBarProvider(context, 'mails'));
}

// This method is called when your extension is deactivated
export function deactivate() {}
