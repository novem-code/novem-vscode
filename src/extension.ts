// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import axios from 'axios'
import * as vscode from 'vscode';

class NovemSideBarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        const token = vscode.workspace.getConfiguration('novem').get('auth_token');
        if (!token)
            return Promise.resolve([new vscode.TreeItem("Please configure novem.auth_token")]);

        return axios
          .get("https://api.novem.no/v1/vis/plots", {
            headers: { Authorization: `Bearer ${token}` },
          })
          .then((response) => {
            console.log(response);
            return response.data.map((each: any) => new vscode.TreeItem(each.name));
          })
          .catch((error) => {
            console.log("Error!", !error);
            return [new vscode.TreeItem("Error loading plots")];
          });
    }
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "novem-vscode" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('novem-vscode.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from novem-vscode!');

	});

	context.subscriptions.push(disposable);

	vscode.window.registerTreeDataProvider('novem-sidebar', new NovemSideBarProvider());
}

// This method is called when your extension is deactivated
export function deactivate() {}