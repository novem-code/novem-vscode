import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { writeConfig } from './config';

function getWebviewContent(webview: vscode.Webview, extensionPath: string) {
    // Path to the compiled SPA
    const htmlPath = path.join(extensionPath, 'dist', 'novem_web_view', 'index.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Convert local resource paths to webview URIs
    const scriptPathOnDisk = vscode.Uri.file(
        path.join(extensionPath, 'dist', 'novem_web_view', 'bundle.js'),
    );
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    const cssPathOnDisk = vscode.Uri.file(
        path.join(extensionPath, 'dist', 'novem_web_view', 'bundle.css'),
    );
    const cssUri = webview.asWebviewUri(cssPathOnDisk);

    // Inject the URIs into the HTML content
    htmlContent = htmlContent.replace(/bundle\.js/g, scriptUri.toString());
    htmlContent = htmlContent.replace(/bundle\.css/g, cssUri.toString());

    return htmlContent;
}

function getThemeColor(colorId: string): string | undefined {
    return vscode.workspace.getConfiguration('workbench').get(`colorCustomizations.${colorId}`);
}

export function createNovemBrowser(
    type: string,
    visId: string,
    shortname: string,
    uri: string,
    token?: string,
    apiRoot?: string,
    username?: string,
    profileName?: string,
) {
    const panel = vscode.window.createWebviewPanel(shortname, visId, vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });

    // Set the HTML content of the WebView panel
    const content = getWebviewContent(
        panel.webview,
        vscode.extensions.getExtension('novem.novem-vscode')!.extensionPath,
    );
    panel.webview.html = content;

    console.log('ready');

    panel.webview.onDidReceiveMessage(async message => {
        if (message.command === 'contentReady') {
            // Now that the content is ready, send the navigation message
            panel.webview.postMessage({
                command: 'navigate',
                route: `/${type}`,
                visId: visId,
                uri: uri,
                shortName: shortname,
                token: token,
                apiRoot: apiRoot,
                username: username,
            });
        }

        if (message.command === 'signinSuccessful') {
            console.log('signinSuccessful', message);
            try {
                await writeConfig({
                    username: message.username,
                    token: message.token,
                    token_name: message.token_name,
                    api_root: message.api_root,
                    profile: profileName || message.username,
                });
                console.log('Config written successfully, reloading window...');
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            } catch (error) {
                console.error('Failed to write config:', error);
                vscode.window.showErrorMessage(`Failed to save login: ${error}`);
            }
        }
    });
}
