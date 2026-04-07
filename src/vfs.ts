import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { UserConfig } from './config';
import NovemApi from './novem-api';
import { CacheWatcher } from './cache-watcher';

export class NovemFSProvider implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]> =
        new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
        this._onDidChangeFile.event;

    private api: NovemApi;
    private cacheDir: string | null;
    private cacheWatcher: CacheWatcher | null;

    constructor(api: NovemApi, cacheDir?: string, cacheWatcher?: CacheWatcher) {
        this.api = api;
        this.cacheDir = cacheDir || null;
        this.cacheWatcher = cacheWatcher || null;
    }

    private writeToCache(uri: vscode.Uri, content: string): void {
        if (!this.cacheDir) return;
        const novemPath = `/${uri.authority}${uri.path}`;
        const localPath = path.join(this.cacheDir, ...novemPath.split('/').filter(Boolean));
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content, 'utf-8');
        if (this.cacheWatcher) {
            this.cacheWatcher.updateKnownContent(novemPath, content);
        }
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const content = await this.api.readFile(uri.authority, uri.path);
        this.writeToCache(uri, content);
        return new TextEncoder().encode(content);
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean },
    ): Promise<void> {
        const data = new TextDecoder().decode(content);
        await this.api.writeFile(uri.authority, uri.path, data);
        this.writeToCache(uri, data);
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
