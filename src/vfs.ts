import * as vscode from 'vscode';

import { UserConfig } from './config';
import NovemApi from './novem-api';

export class NovemFSProvider implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]> =
        new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
        this._onDidChangeFile.event;

    private api: NovemApi;
    constructor(api: NovemApi) {
        this.api = api;
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        // TODO: Let's add some caching here so we don't have to fetch it from the server all the time?
        const content = await this.api.readFile(uri.path);
        return new TextEncoder().encode(content);
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean },
    ): Promise<void> {
        const data = new TextDecoder().decode(content);
        await this.api.writeFile(uri.path, data);
    }

    // Stub implementations for other required methods
    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // For simplicity, we're not handling file watching in this example.
        // This method is required by the FileSystemProvider interface.
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return {
            type: vscode.FileType.File, // Assuming everything is a file for simplicity
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

    // Use this method to notify VS Code about file changes
    private notifyFileChange(uri: vscode.Uri, type: vscode.FileChangeType): void {
        this._onDidChangeFile.fire([{ uri, type }]);
    }
}
