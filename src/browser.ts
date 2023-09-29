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

    // Function to send theme and color info to the webview
    const sendThemeInfo = () => {
        const currentThemeKind = vscode.window.activeColorTheme.kind;
        let theme: 'light' | 'dark' | 'highContrast' = 'dark'; // Default to dark

        if (currentThemeKind === vscode.ColorThemeKind.Light) {
            theme = 'light';
        } else if (currentThemeKind === vscode.ColorThemeKind.Dark) {
            theme = 'dark';
        } else if (currentThemeKind === vscode.ColorThemeKind.HighContrast) {
            theme = 'highContrast';
        }

        const colors = {
            foreground: getThemeColor('editor.foreground'),
            background: getThemeColor('editor.background'),
            // ... add more colors as needed
        };

        panel.webview.postMessage({
            command: 'setTheme',
            theme: theme,
            colors: colors,
        });
    };

    // Send the initial theme info
    sendThemeInfo();

    // Set up an event listener for theme changes
    let themeChangeListener = vscode.window.onDidChangeActiveColorTheme((e) => {
        sendThemeInfo();
    });

    // Ensure the listener is disposed when the webview is disposed
    panel.onDidDispose(() => {
        themeChangeListener.dispose();
    });

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
