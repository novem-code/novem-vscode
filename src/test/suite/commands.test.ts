import * as assert from 'assert';
import * as vscode from 'vscode';

import { setupCommands } from '../../commands';
import NovemApi from '../../novem-api';
import {
    BaseNovemProvider,
    JobsProvider,
    MyTreeItem,
    NovemResourcesProvider,
    VisType,
} from '../../tree';

suite('Node mutations preserve the exploration tree', () => {
    const commands = new Map<string, (...args: any[]) => any>();
    const originalRegisterCommand = vscode.commands.registerCommand;
    const originalInputBox = vscode.window.showInputBox;
    const originalInformationMessage = vscode.window.showInformationMessage;
    const originalWarningMessage = vscode.window.showWarningMessage;
    let subscriptions: vscode.Disposable[];

    setup(() => {
        commands.clear();
        subscriptions = [];
        vscode.commands.registerCommand = (name, handler) => {
            commands.set(name, handler);
            return new vscode.Disposable(() => commands.delete(name));
        };
        vscode.window.showInputBox = async () => 'webstat_api_key';
        vscode.window.showInformationMessage = async () => undefined;
        vscode.window.showWarningMessage = (async () => 'Delete') as typeof originalWarningMessage;
    });

    teardown(() => {
        for (const subscription of subscriptions) subscription.dispose();
        vscode.commands.registerCommand = originalRegisterCommand;
        vscode.window.showInputBox = originalInputBox;
        vscode.window.showInformationMessage = originalInformationMessage;
        vscode.window.showWarningMessage = originalWarningMessage;
    });

    for (const action of ['create', 'delete']) {
        test(`${action} keeps the job cached and refreshes its subtree`, async () => {
            const nodePath = '/daily/config/env/webstat_api_key';
            let entries = action === 'delete' ? ['webstat_api_key'] : [];
            const mutations: string[][] = [];
            const directory = (name: string) => ({ name, type: 'dir', permissions: ['r', 'w'] });
            const api = {
                createNodeInDirectory: async (type: string, path: string) => {
                    mutations.push([type, path]);
                    entries.push('webstat_api_key');
                },
                deleteNode: async (type: string, path: string) => {
                    mutations.push([type, path]);
                    entries = [];
                },
                getDetailsForJob: async (_id: string, path: string) => {
                    if (!path) return [directory('config')];
                    if (path === 'config') return [directory('env')];
                    return entries.map(name => ({
                        name,
                        type: 'file',
                        permissions: ['r', 'w', 'd'],
                    }));
                },
                invalidateVisCache: () => assert.fail('a node mutation must keep the root cache'),
            } as unknown as NovemApi;
            const context = {
                subscriptions,
                globalState: { get: () => ({ user_info: { username: 'alice' } }) },
            } as unknown as vscode.ExtensionContext;
            setupCommands(context, api);

            const types: VisType[] = ['plots', 'mails', 'grids', 'docs', 'jobs', 'repos'];
            const providers = {} as Record<VisType, BaseNovemProvider>;
            for (const type of types) {
                providers[type] = new JobsProvider(api, context);
                providers[type].primeRootItems(type === 'jobs' ? [{ id: 'daily' }] : []);
            }
            const resources = new NovemResourcesProvider(providers);
            subscriptions.push(resources);
            const sections = await resources.getChildren();
            const jobSection = sections[4];
            const [job] = (await resources.getChildren(jobSection)) as MyTreeItem[];
            const [config] = (await resources.getChildren(job)) as MyTreeItem[];
            const [env] = (await resources.getChildren(config)) as MyTreeItem[];
            const before = (await resources.getChildren(env)) as MyTreeItem[];
            const changes: unknown[] = [];
            subscriptions.push(resources.onDidChangeTreeData(item => changes.push(item)));

            const command =
                action === 'create' ? 'novem.createNodeInDirectory' : 'novem.deleteNode';
            await commands.get(command)!(action === 'create' ? env : before[0]);

            assert.deepStrictEqual(mutations, [['jobs', nodePath]]);
            assert.deepStrictEqual(changes, [job], 'only the affected job should refresh');
            assert.strictEqual(providers.jobs.rootResourceCount(), 1);
            assert.strictEqual((await resources.getChildren(jobSection))[0], job);
            const [nextConfig] = (await resources.getChildren(job)) as MyTreeItem[];
            const [nextEnv] = (await resources.getChildren(nextConfig)) as MyTreeItem[];
            assert.strictEqual(
                nextConfig.id,
                config.id,
                'config must retain its expansion identity',
            );
            assert.strictEqual(nextEnv.id, env.id, 'env must retain its expansion identity');
            const after = (await resources.getChildren(nextEnv)) as MyTreeItem[];
            assert.deepStrictEqual(
                after.map(item => item.path),
                action === 'create' ? [nodePath] : [],
            );
            if (action === 'create') {
                assert.strictEqual(after[0].command?.command, 'novem.openFile');
            }
        });
    }
});
