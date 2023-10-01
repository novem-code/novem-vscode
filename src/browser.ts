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
    type: string,
    visId: string,
    shortname: string,
    uri: string,
    token?: string,
    apiRoot?: string,
    ignoreSslWarn?: boolean,
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
        vscode.extensions.getExtension('novem.novem-vscode')!.extensionPath,
    );
    panel.webview.html = content;

    panel.webview.onDidReceiveMessage((message) => {
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
                ignoreSslWarn: ignoreSslWarn,
            });
        }
    });




}
