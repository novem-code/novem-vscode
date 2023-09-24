import * as vscode from 'vscode';

function getWebviewContent(visId: string, shortname: string, uri: string) {
    const isDarkMode =
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    return `
        <html data-dark-mode>
        <head>
            <style>
                body {
                    display: flex;
                    flex-direction: column;
                    height: 100vh; /* Use viewport height to set the body height */
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                }

                iframe {
                    flex: 1; /* Allow iframe to take up all available space */
                    width: 100%;
                    border: none; /* Optional: remove border */
                }
            </style>
        </head>
        <body>
            <iframe src="${uri}"></iframe>
        </body>
        </html>
    `;
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
    panel.webview.html = getWebviewContent(visId, shortname, uri);
}
