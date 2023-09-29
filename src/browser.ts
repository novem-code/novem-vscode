import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function getWebviewContent(webview: vscode.Webview, extensionPath: string) {
    // Path to the compiled SPA
    const htmlPath = path.join(
        extensionPath,
        'dist',
        'novem_web_view',
        'index.html',
    );
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // Convert local resource paths to webview URIs
    const scriptPathOnDisk = vscode.Uri.file(
        path.join(extensionPath, 'dist', 'novem_web_view', 'bundle.js'),
    );
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    // Inject the script URI into the HTML content
    htmlContent = htmlContent.replace(/bundle.js/g, scriptUri.toString());

    return htmlContent;
}

function getThemeColor(colorId: string): string | undefined {
    return vscode.workspace
        .getConfiguration('workbench')
        .get(`colorCustomizations.${colorId}`);
}

export function createNovemBrowser(
    visId: string,
    shortname: string,
    uri: string,
    token?: string,
    apiRoot?: string,
) {
    const panel = vscode.window.createWebviewPanel(
        shortname,
        visId,
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        },
    );

    // Set the HTML content of the WebView panel
    const content = getWebviewContent(
        panel.webview,
        vscode.extensions.getExtension('novemas.novem')!.extensionPath,
    );
    panel.webview.html = content;

    // Navigate to the correct route
    
    panel.webview.postMessage({
        command: 'navigate',
        route: '/plot',
        visId: visId,
        uri: uri,
        shortName: shortname,
        token: token,
        apiRoot: apiRoot,
    });
}
