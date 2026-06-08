import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

// Preview panels currently open, keyed by resource. Lets a repeat "view"
// reveal the existing panel instead of opening a duplicate.
const openPanels = new Map<string, vscode.WebviewPanel>();

export function createNovemBrowser(
    type: string,
    visId: string,
    shortname: string,
    uri: string,
    token?: string,
    apiRoot?: string,
    username?: string,
) {
    // shortname is globally unique per resource; fall back to type/user/id.
    const key = shortname || `${type}:${username ?? ''}:${visId}`;

    const existing = openPanels.get(key);
    if (existing) {
        existing.reveal(existing.viewColumn);
        return;
    }

    const panel = vscode.window.createWebviewPanel(shortname, visId, vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
    });

    openPanels.set(key, panel);
    panel.onDidDispose(() => {
        if (openPanels.get(key) === panel) {
            openPanels.delete(key);
        }
    });

    // Set the HTML content of the WebView panel
    const content = getWebviewContent(
        panel.webview,
        vscode.extensions.getExtension('novem.novem-vscode')!.extensionPath,
    );
    panel.webview.html = content;

    console.log('ready');

    panel.webview.onDidReceiveMessage(message => {
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
    });
}
