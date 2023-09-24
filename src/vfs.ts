import * as vscode from 'vscode';
import axios from 'axios';

import { UserConfig } from './config';

export function activate(context: vscode.ExtensionContext) {
    // Register FileSystemProvider
    const fsProvider = new NovemFSProvider(context);
    const fsRegistration = vscode.workspace.registerFileSystemProvider(
        'novem',
        fsProvider,
        { isCaseSensitive: true },
    );

    context.subscriptions.push(fsRegistration);
}

export class NovemFSProvider implements vscode.FileSystemProvider {
    private context: vscode.ExtensionContext;
    private readonly _onDidChangeFile: vscode.EventEmitter<
        vscode.FileChangeEvent[]
    > = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
        this._onDidChangeFile.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private getToken(): string | undefined {
        const conf = this.context.globalState.get('userConfig') as UserConfig;
        return conf?.token;
    }

    private getApiRoot(): string | undefined {
        const conf = this.context.globalState.get('userConfig') as UserConfig;
        return conf?.api_root;
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        // TODO: Let's add some caching here so we don't have to fetch it from the server all the time?
        const content = await fetchDataFromServer(
            uri.path,
            this.getToken(),
            this.getApiRoot(),
        );
        return new TextEncoder().encode(content);
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean },
    ): Promise<void> {
        const data = new TextDecoder().decode(content);
        await postDataToServer(
            uri.path,
            data,
            this.getToken(),
            this.getApiRoot(),
        );
    }

    // Stub implementations for other required methods
    watch(
        uri: vscode.Uri,
        options: { recursive: boolean; excludes: string[] },
    ): vscode.Disposable {
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

    rename(
        oldUri: vscode.Uri,
        newUri: vscode.Uri,
        options: { overwrite: boolean },
    ): void {
        throw new vscode.FileSystemError('Method not implemented: rename.');
    }

    // Use this method to notify VS Code about file changes
    private notifyFileChange(
        uri: vscode.Uri,
        type: vscode.FileChangeType,
    ): void {
        this._onDidChangeFile.fire([{ uri, type }]);
    }
}

// Helper functions
async function fetchDataFromServer(
    filePath: string,
    token?: string,
    apiRoot?: string,
): Promise<string> {
    const url = `${apiRoot}vis${filePath}`;

    try {
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

async function postDataToServer(
    filePath: string,
    content: string,
    token?: string,
    apiRoot?: string,
): Promise<void> {
    const url = `${apiRoot}vis${filePath}`;

    try {
        await axios.post(url, content, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'text/plain', // Set content type as text/plain
            },
        });
    } catch (error) {
        console.error('Error posting data:', error);
        throw error;
    }
}
