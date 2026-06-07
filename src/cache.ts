import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import NovemApi from './novem-api';

/**
 * NovemCache manages a local file cache that mirrors novem resources to disk.
 *
 * Features:
 * - Caches entire resource directories on first file access
 * - Auto-pushes external edits (e.g. from Claude Code) to the novem API
 * - Re-seeds from open tabs on activation to survive restarts
 * - Cleans up cached directories when all tabs for a resource are closed
 * - Invalidates and re-fetches on refresh
 * - Clears everything on user/profile switch
 */
export class NovemCache {
    private cacheDir: string;
    private api: NovemApi;

    // Track which resources have been fully cached
    private cachedResources = new Set<string>();
    // Map local file paths to novem paths
    private fileToNovemPath = new Map<string, string>();
    // Known content for change detection
    private knownContent = new Map<string, string>();
    // Debounce timers for file watcher
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    // File system watcher
    private watcher: fs.FSWatcher | null = null;

    constructor(cacheDir: string, api: NovemApi) {
        this.cacheDir = cacheDir;
        this.api = api;

        try {
            fs.mkdirSync(cacheDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create novem cache directory:', error);
        }
    }

    /**
     * Get the cache directory path.
     */
    getCacheDir(): string {
        return this.cacheDir;
    }

    /**
     * Get the novem path for a local file path, if tracked.
     */
    getNovemPath(localPath: string): string | undefined {
        return this.fileToNovemPath.get(localPath);
    }

    // ── Lifecycle ──────────────────────────────────────────────────────

    /**
     * Initialize the cache on extension activation.
     * Cleans up stale resources, re-seeds from open tabs, starts the file watcher.
     */
    activate(context: vscode.ExtensionContext): void {
        this.cachedResources.clear();
        this.fileToNovemPath.clear();
        this.knownContent.clear();

        this.cleanupStaleCache();

        const openPaths = this.getOpenCachedFilePaths();
        if (openPaths.length > 0) {
            this.seedFromDisk(openPaths);

            // Rebuild fileToNovemPath from open file paths
            for (const filePath of openPaths) {
                const relative = path.relative(this.cacheDir, filePath);
                const novemPath = '/' + relative.split(path.sep).join('/');
                this.fileToNovemPath.set(filePath, novemPath);
            }

            // Seed all files in open resource directories (not just open tabs)
            for (const key of this.getOpenResourceKeys()) {
                const resourceDir = path.join(this.cacheDir, ...key.split('/'));
                this.seedDirectoryFromDisk(resourceDir);
            }
        }

        this.startWatcher();
        context.subscriptions.push(new vscode.Disposable(() => this.stopWatcher()));

        // Clean up cached resource directories when all tabs for that resource are closed
        context.subscriptions.push(
            vscode.window.tabGroups.onDidChangeTabs(event => {
                if (event.closed.length === 0) return;
                this.cleanupClosedResources();
            }),
        );
    }

    /**
     * Clear the entire cache and close cached file tabs.
     * Used when switching user/profile.
     */
    reset(): void {
        // Close tabs pointing at cached files
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const uri = (tab.input as any)?.uri as vscode.Uri | undefined;
                if (uri && uri.scheme === 'file' && uri.fsPath.startsWith(this.cacheDir)) {
                    vscode.window.tabGroups.close(tab);
                }
            }
        }

        // Wipe the cache directory
        try {
            fs.rmSync(this.cacheDir, { recursive: true, force: true });
            fs.mkdirSync(this.cacheDir, { recursive: true });
        } catch {
            // best effort
        }

        this.cachedResources.clear();
        this.fileToNovemPath.clear();
        this.knownContent.clear();
    }

    // ── Resource caching ───────────────────────────────────────────────

    /**
     * Ensure a resource directory is fully cached. Call before opening a file.
     * No-ops if the resource has already been cached this session.
     */
    async ensureResourceCached(visType: string, resourceId: string): Promise<void> {
        const key = `${visType}/${resourceId}`;
        if (this.cachedResources.has(key)) return;

        await this.fetchResourceDirectory(visType, resourceId);
        this.cachedResources.add(key);
    }

    /**
     * Cache a single file from the API. Returns the local file path.
     */
    async cacheFile(visType: string, filePath: string): Promise<string | undefined> {
        const novemPath = `/${visType}${filePath}`;
        try {
            const content = await this.api.readFile(visType, filePath);
            if (content !== undefined) {
                const localPath = this.novemPathToLocal(novemPath);
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(localPath, content, 'utf-8');
                this.knownContent.set(novemPath, content);
                this.fileToNovemPath.set(localPath, novemPath);
                return localPath;
            }
        } catch (error) {
            console.error(`Failed to cache ${novemPath}:`, error);
        }
        return undefined;
    }

    /**
     * Get the local path for a novem file (may or may not exist on disk yet).
     */
    getLocalPath(visType: string, filePath: string): string {
        const novemPath = `/${visType}${filePath}`;
        return this.novemPathToLocal(novemPath);
    }

    /**
     * Invalidate cached resources for a given visType and re-fetch open files.
     * Called when the user hits refresh.
     */
    async invalidateAndRefresh(visType: string): Promise<void> {
        const keysToInvalidate: string[] = [];
        for (const key of this.cachedResources) {
            if (key.startsWith(`${visType}/`)) {
                keysToInvalidate.push(key);
            }
        }

        for (const key of keysToInvalidate) {
            this.cachedResources.delete(key);
        }

        // Re-fetch any resources that have open tabs
        const openKeys = this.getOpenResourceKeys();
        for (const key of keysToInvalidate) {
            if (openKeys.has(key)) {
                const parts = key.split('/');
                await this.fetchResourceDirectory(parts[0], parts[1]);
                this.cachedResources.add(key);
            }
        }
    }

    // ── Save handling ──────────────────────────────────────────────────

    /**
     * Push a saved file's content to the novem API.
     */
    async pushFile(localPath: string, content: string): Promise<void> {
        const novemPath = this.fileToNovemPath.get(localPath);
        if (!novemPath) return;

        const parts = novemPath.split('/').filter(Boolean);
        const visType = parts[0];
        const subPath = '/' + parts.slice(1).join('/');

        try {
            await this.api.writeFile(visType, subPath, content);
            this.knownContent.set(novemPath, content);
            console.log(`Pushed ${novemPath.replace(/^\//, '')} to novem`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to push ${novemPath} to novem: ${error}`);
        }
    }

    /**
     * Write content to the local cache (used by NovemFSProvider).
     */
    writeToLocalCache(novemPath: string, content: string): void {
        const localPath = this.novemPathToLocal(novemPath);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content, 'utf-8');
        this.knownContent.set(novemPath, content);
    }

    // ── Private: file watcher ──────────────────────────────────────────

    private startWatcher(): void {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        this.watcher = fs.watch(this.cacheDir, { recursive: true }, (_event, filename) => {
            if (!filename) return;

            const fullPath = path.join(this.cacheDir, filename);
            const novemPath = '/' + filename.split(path.sep).join('/');

            const existing = this.debounceTimers.get(novemPath);
            if (existing) clearTimeout(existing);

            this.debounceTimers.set(
                novemPath,
                setTimeout(() => {
                    this.debounceTimers.delete(novemPath);
                    this.handleExternalChange(fullPath, novemPath);
                }, 500),
            );
        });
    }

    private stopWatcher(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }

    private async handleExternalChange(fullPath: string, novemPath: string): Promise<void> {
        try {
            if (!fs.existsSync(fullPath)) return;
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) return;

            const newContent = fs.readFileSync(fullPath, 'utf-8');
            const known = this.knownContent.get(novemPath);

            // Only fire if content actually changed
            if (known !== undefined && newContent === known) return;

            // Auto-push to novem API
            const shortPath = novemPath.replace(/^\//, '');
            const parts = novemPath.split('/').filter(Boolean);
            const visType = parts[0];
            const subPath = '/' + parts.slice(1).join('/');

            await this.api.writeFile(visType, subPath, newContent);
            this.knownContent.set(novemPath, newContent);
            console.log(`Auto-pushed ${shortPath} to novem`);
        } catch (error) {
            const shortPath = novemPath.replace(/^\//, '');
            vscode.window.showErrorMessage(`Failed to push ${shortPath}: ${error}`);
        }
    }

    // Directories to skip during recursive caching (e.g. "files" generates
    // PNGs/PDFs on access which is expensive and unnecessary for local caching)
    private static readonly SKIP_DIRS = new Set(['files']);

    // ── Private: resource fetching ─────────────────────────────────────

    private async fetchResourceDirectory(
        visType: string,
        resourceId: string,
        dirPath?: string,
    ): Promise<void> {
        let entries: any[];
        try {
            if (visType === 'jobs') {
                entries = await this.api.getDetailsForJob(resourceId, dirPath);
            } else if (visType === 'repos') {
                entries = await this.api.getDetailsForRepo(resourceId, dirPath);
            } else {
                entries = await this.api.getDetailsForVis(
                    visType as 'plots' | 'mails' | 'grids' | 'docs',
                    resourceId,
                    dirPath,
                );
            }
        } catch (error) {
            // TODO: Some directories (e.g. "shared") are listed by the API but return 404
            // when accessed. Consider filtering these out or handling 404s specifically.
            console.error(`Failed to list ${visType}/${resourceId}/${dirPath || ''}:`, error);
            return;
        }

        if (!Array.isArray(entries)) {
            console.warn(
                `Expected array for ${visType}/${resourceId}/${dirPath || ''}, got:`,
                typeof entries,
            );
            return;
        }

        console.log(
            `Caching ${entries.length} entries from ${visType}/${resourceId}/${dirPath || ''}`,
        );

        for (const entry of entries) {
            if (!entry.name) continue;
            const entryPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;

            if (entry.type === 'dir') {
                if (NovemCache.SKIP_DIRS.has(entry.name)) continue;
                await this.fetchResourceDirectory(visType, resourceId, entryPath);
            } else if (entry.type === 'file') {
                const novemPath = `/${visType}/${resourceId}/${entryPath}`;
                try {
                    const content = await this.api.readFile(visType, `/${resourceId}/${entryPath}`);
                    if (content !== undefined) {
                        const localPath = this.novemPathToLocal(novemPath);
                        fs.mkdirSync(path.dirname(localPath), { recursive: true });
                        fs.writeFileSync(localPath, content, 'utf-8');
                        this.knownContent.set(novemPath, content);
                        this.fileToNovemPath.set(localPath, novemPath);
                    }
                } catch {
                    // Skip files we can't read
                }
            }
        }
    }

    // ── Private: cleanup ───────────────────────────────────────────────

    private cleanupStaleCache(): void {
        const openKeys = this.getOpenResourceKeys();

        try {
            const visTypes = fs.readdirSync(this.cacheDir, { withFileTypes: true });
            for (const visDir of visTypes) {
                if (!visDir.isDirectory()) continue;
                const visPath = path.join(this.cacheDir, visDir.name);
                const resources = fs.readdirSync(visPath, { withFileTypes: true });

                for (const resDir of resources) {
                    if (!resDir.isDirectory()) continue;
                    const key = `${visDir.name}/${resDir.name}`;
                    if (!openKeys.has(key)) {
                        fs.rmSync(path.join(visPath, resDir.name), {
                            recursive: true,
                            force: true,
                        });
                    }
                }

                const remaining = fs.readdirSync(visPath);
                if (remaining.length === 0) {
                    fs.rmdirSync(visPath);
                }
            }
        } catch {
            // Cache dir may not exist yet
        }
    }

    private cleanupClosedResources(): void {
        const openKeys = this.getOpenResourceKeys();

        for (const key of this.cachedResources) {
            if (!openKeys.has(key)) {
                this.cachedResources.delete(key);
                const resourceDir = path.join(this.cacheDir, ...key.split('/'));
                try {
                    fs.rmSync(resourceDir, { recursive: true, force: true });
                    const parentDir = path.dirname(resourceDir);
                    const remaining = fs.readdirSync(parentDir);
                    if (remaining.length === 0) {
                        fs.rmdirSync(parentDir);
                    }
                } catch {
                    // best effort cleanup
                }

                const prefix = `/${key}`;
                for (const [filePath, novemPath] of this.fileToNovemPath) {
                    if (novemPath.startsWith(prefix)) {
                        this.fileToNovemPath.delete(filePath);
                    }
                }
            }
        }
    }

    // ── Private: seeding ───────────────────────────────────────────────

    private seedFromDisk(filePaths: string[]): void {
        for (const fullPath of filePaths) {
            try {
                if (!fs.existsSync(fullPath)) continue;
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) continue;

                const relative = path.relative(this.cacheDir, fullPath);
                const novemPath = '/' + relative.split(path.sep).join('/');
                const content = fs.readFileSync(fullPath, 'utf-8');
                this.knownContent.set(novemPath, content);
            } catch {
                // skip files we can't read
            }
        }
    }

    private seedDirectoryFromDisk(dirPath: string): void {
        try {
            if (!fs.existsSync(dirPath)) return;
            const files = this.walkDir(dirPath);
            this.seedFromDisk(files);
        } catch {
            // best effort
        }
    }

    // ── Private: helpers ───────────────────────────────────────────────

    private novemPathToLocal(novemPath: string): string {
        return path.join(this.cacheDir, ...novemPath.split('/').filter(Boolean));
    }

    private getOpenCachedFilePaths(): string[] {
        const paths: string[] = [];
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const uri = (tab.input as any)?.uri as vscode.Uri | undefined;
                if (uri && uri.scheme === 'file' && uri.fsPath.startsWith(this.cacheDir)) {
                    paths.push(uri.fsPath);
                }
            }
        }
        return paths;
    }

    private getOpenResourceKeys(): Set<string> {
        const keys = new Set<string>();
        for (const filePath of this.getOpenCachedFilePaths()) {
            const relative = path.relative(this.cacheDir, filePath);
            const parts = relative.split(path.sep);
            if (parts.length >= 2) {
                keys.add(`${parts[0]}/${parts[1]}`);
            }
        }
        return keys;
    }

    private walkDir(dir: string): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.walkDir(fullPath));
            } else {
                results.push(fullPath);
            }
        }
        return results;
    }
}
