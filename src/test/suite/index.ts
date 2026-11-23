import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import { run as runTests } from 'node:test';
import { spec } from 'node:test/reporters';

// `isolation: 'none'` (Node >= 22.8) runs every test file inside this process.
// That is required here: the tests import `vscode`, which only resolves inside
// the extension host, so node:test's default of one child process per file
// cannot work. The pinned @types/node (20.x, see dependabot.yml) predates the
// option, hence the widened type.
type RunOptions = NonNullable<Parameters<typeof runTests>[0]> & { isolation: 'none' };

// Entry point VS Code calls (via --extensionTestsPath) inside the extension host.
export function run(): Promise<void> {
    const testsRoot = path.resolve(__dirname, '..');
    const files = fs
        .readdirSync(testsRoot, { recursive: true, encoding: 'utf8' })
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.resolve(testsRoot, f));

    return new Promise((resolve, reject) => {
        // With isolation 'none', node:test finishes the run (and ends this
        // stream) only when the process exits. The extension host stays up
        // until we resolve, so we detect completion ourselves: every
        // top-level suite is enqueued before any of them completes, and once
        // the counts match across a macrotask boundary nothing is left.
        const stream = runTests({ files, isolation: 'none' } as RunOptions);
        const report = new PassThrough({ objectMode: true });
        const output = report.compose(new spec());
        output.pipe(process.stdout);

        let enqueued = 0;
        let completed = 0;
        let passes = 0;
        let failures = 0;
        let running: string | undefined;
        let done = false;

        const finish = (error?: Error) => {
            done = true;
            clearTimeout(watchdog);
            output.on('end', () => {
                console.log(`\n${passes} passing, ${failures} failing`);
                if (error) {
                    reject(error);
                } else if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
            report.end();
        };

        // run()'s `timeout` option only reaches the root test (suites reset
        // it), so instead of a per-test timeout we fail the whole run if no
        // test event arrives for STALL_MS, naming the test that is stuck.
        const STALL_MS = 15_000;
        const stalled = () =>
            finish(
                new Error(
                    `No test progress for ${STALL_MS}ms; stuck in: ${running ?? '(unknown)'}`,
                ),
            );
        const watchdog = setTimeout(stalled, STALL_MS);

        stream.on('data', event => {
            if (done) {
                return;
            }
            watchdog.refresh();
            report.write(event);
            const { type, data } = event;
            if (type === 'test:dequeue') {
                // The last test or suite dequeued is the one that is running.
                running = data.name;
            }
            // A failing test also fails its enclosing suites; count tests only.
            if (data?.details?.type !== 'suite') {
                if (type === 'test:pass') {
                    passes++;
                } else if (type === 'test:fail') {
                    failures++;
                }
            }
            if (data?.nesting !== 0) {
                return;
            }
            if (type === 'test:enqueue') {
                enqueued++;
            } else if (type === 'test:complete') {
                completed++;
                setImmediate(() => {
                    if (!done && completed === enqueued) {
                        finish();
                    }
                });
            }
        });
        stream.on('error', error => !done && finish(error));
    });
}
