import axios from 'axios';
import * as vscode from 'vscode';

// Import the functions from config.ts
import { getCurrentConfig, UserConfig } from './config';
import { NovemSideBarProvider } from './tree';

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
	let disposable = vscode.commands.registerCommand('novem-vscode.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from novem-vscode!');

	});

	context.subscriptions.push(disposable);

	vscode.window.registerTreeDataProvider('novem-plots', new NovemSideBarProvider(context, 'plots'));
    vscode.window.registerTreeDataProvider('novem-mails', new NovemSideBarProvider(context, 'mails'));
}

// This method is called when your extension is deactivated
export function deactivate() {}
