import * as vscode from 'vscode';

// Identify the extension on every outgoing request. Without a UA, requests
// arrive as Node's bare `node` and cannot be told apart from generic API
// clients. The version comes from the manifest because the release workflow
// rewrites package.json from the git tag; a constant here would silently
// freeze.
export function userAgent(): string {
    const version = vscode.extensions.getExtension('novem.novem-vscode')?.packageJSON?.version;
    return `novem-vscode/${version ?? 'dev'}`;
}
