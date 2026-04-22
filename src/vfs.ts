import * as vscode from 'vscode';

import { UserConfig } from './config';
import NovemApi from './novem-api';
import { NovemCache } from './cache';

export class NovemFSProvider implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]> =
        new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
        this._onDidChangeFile.event;

    private api: NovemApi;
    private cache: NovemCache | null;

    constructor(api: NovemApi, cache?: NovemCache) {
        this.api = api;
        this.cache = cache || null;
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const content = await this.api.readFile(uri.authority, uri.path);
        if (this.cache) {
            const novemPath = `/${uri.authority}${uri.path}`;
            this.cache.writeToLocalCache(novemPath, content);
        }
        return new TextEncoder().encode(content);
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean },
    ): Promise<void> {
        const data = new TextDecoder().decode(content);
        await this.api.writeFile(uri.authority, uri.path, data);
        if (this.cache) {
            const novemPath = `/${uri.authority}${uri.path}`;
            this.cache.writeToLocalCache(novemPath, data);
        }
    }

    // Stub implementations for other required methods
    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0,
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
