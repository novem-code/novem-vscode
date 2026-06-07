import * as vscode from 'vscode';

import NovemApi from './novem-api';

/**
 * Live FileSystemProvider for the novem:// scheme. Each opened file is read
 * from the API on demand and written back on save — no disk cache, no
 * recursive prefetch. VSCode holds the document in memory while it's open.
 */
export class NovemFSProvider implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]> =
        new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
        this._onDidChangeFile.event;

    private api: NovemApi;
    private onDidWrite?: (visType: string, path: string) => void;

    constructor(api: NovemApi, onDidWrite?: (visType: string, path: string) => void) {
        this.api = api;
        this.onDidWrite = onDidWrite;
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const content = await this.api.readFile(uri.authority, uri.path);
        return new TextEncoder().encode(content);
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean },
    ): Promise<void> {
        await this.api.writeFile(uri.authority, uri.path, new TextDecoder().decode(content));
        // uri.authority is the vis type (plots/mails/grids/docs/jobs/repos),
        // uri.path is /<id>/<...>. Let listeners react to config changes that
        // alter a resource's structure (e.g. plot type -> custom adds a
        // config/custom folder).
        this.onDidWrite?.(uri.authority, uri.path);
    }

    // Stub implementations for other required methods
    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // File watching isn't supported for novem:// — directory listing is
        // handled by the tree providers via the API.
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return {
            type: vscode.FileType.File, // Everything we open is a file
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0, // Size isn't known without additional server info
        };
    }

    readDirectory(
        uri: vscode.Uri,
    ): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        throw new vscode.FileSystemError('Method not implemented: readDir.');
    }

    createDirectory(uri: vscode.Uri): void {
        throw new vscode.FileSystemError('Method not implemented: createDir.');
    }

    delete(uri: vscode.Uri, options: { recursive: boolean }): void {
        throw new vscode.FileSystemError('Method not implemented: delete.');
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        throw new vscode.FileSystemError('Method not implemented: rename.');
    }

    private notifyFileChange(uri: vscode.Uri, type: vscode.FileChangeType): void {
        this._onDidChangeFile.fire([{ uri, type }]);
    }
}
