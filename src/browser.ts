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

export function createNovemBrowser(
    visId: string,
    shortname: string,
    uri: string,
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
    panel.webview.html = getWebviewContent(
        panel.webview,
        vscode.extensions.getExtension('novemas.novem')!.extensionPath,
    );
}
