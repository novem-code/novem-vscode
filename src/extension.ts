import axios from 'axios';
import * as vscode from 'vscode';

// Import the functions from config.ts
import { getCurrentConfig, UserConfig } from './config';

class NovemSideBarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private context: vscode.ExtensionContext;
  private type: String;

  constructor(context: vscode.ExtensionContext, type:String) {
      this.context = context;
      this.type = type;
  }
  async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        // Get our token from the user config
        //const [confExists, conf] = await getCurrentConfig();

        const conf = this.context.globalState.get('userConfig') as UserConfig;
        const token = conf?.token;

        if (!token) {
            return [new vscode.TreeItem("Please setup novem by running `novem --init`")];
        }

        return axios
            .get(`https://api.novem.no/v1/vis/${this.type}`, {
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
