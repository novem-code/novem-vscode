import * as fs from 'fs';
import * as path from 'path';

export class CacheWatcher {
    private cacheDir: string;
    private knownContent: Map<string, string> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private watcher: fs.FSWatcher | null = null;
    private onChange: (novemPath: string, content: string) => void;

    constructor(cacheDir: string, onChange: (novemPath: string, content: string) => void) {
        this.cacheDir = cacheDir;
        this.onChange = onChange;
    }

    start(): void {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        this.watcher = fs.watch(this.cacheDir, { recursive: true }, (_event, filename) => {
            if (!filename) return;

            const fullPath = path.join(this.cacheDir, filename);
            const novemPath = '/' + filename.split(path.sep).join('/');

            // Debounce — editors fire multiple events per save
            const existing = this.debounceTimers.get(novemPath);
            if (existing) clearTimeout(existing);

            this.debounceTimers.set(
                novemPath,
                setTimeout(() => {
                    this.debounceTimers.delete(novemPath);
                    this.handleChange(fullPath, novemPath);
                }, 500),
            );
        });
    }

    stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }

    updateKnownContent(novemPath: string, content: string): void {
        this.knownContent.set(novemPath, content);
    }

    private handleChange(fullPath: string, novemPath: string): void {
        try {
            if (!fs.existsSync(fullPath)) return;
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) return;

            const newContent = fs.readFileSync(fullPath, 'utf-8');
            const known = this.knownContent.get(novemPath);

            // Only fire if content actually changed
            if (known !== undefined && newContent === known) return;

            this.onChange(novemPath, newContent);
        } catch {
            // File may have been deleted between events
        }
    }
}
