import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as ini from 'ini';

const NOVEM_PATH = "novem";
const NOVEM_NAME = "novem.conf";

export async function getUserConfigDirectory(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
        if (os.platform() === 'win32') {
            const localAppData = process.env.LOCALAPPDATA;
            if (localAppData) {
                resolve(localAppData);
                return;
            }
            const appData = process.env.APPDATA;
            if (appData) {
                resolve(appData);
                return;
            }
            resolve(null);
            return;
        }
        const xdgConfigHome = process.env.XDG_CONFIG_HOME;
        if (xdgConfigHome) {
            resolve(xdgConfigHome);
            return;
        }
        resolve(path.join(os.homedir(), '.config'));
    });
}

export async function getConfigPath(): Promise<[string, string]> {
    const configPath = await getUserConfigDirectory();
    if (!configPath) {
        throw new Error("Unable to find a suitable configuration directory.");
    }
    const novemDir = path.join(configPath, NOVEM_PATH);
    const novemConfig = path.join(configPath, NOVEM_PATH, NOVEM_NAME);
    return [novemDir, novemConfig];
}

export async function getCurrentConfig(kwargs?: {
    config_path?: string,
    ignore_config?: boolean,
    api_root?: string,
    profile?: string,
    token?: string
}): Promise<[boolean, { [key: string]: any }]> {
    let configPath: string;
    if (!kwargs?.config_path) {
        [, configPath] = await getConfigPath();
    } else {
        configPath = kwargs.config_path;
    }

    const co: { [key: string]: any } = {};
    co.ignore_ssl_warn = false;

    if (kwargs?.ignore_config) {
        if (kwargs.api_root) {
            co.api_root = kwargs.api_root;
        }
        return [true, co];
    }

    if (!fs.existsSync(configPath)) {
        return [false, co];
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = ini.parse(configContent);

    if (kwargs?.api_root) {
        co.api_root = kwargs.api_root;
    } else if (config.general && config.general.api_root) {
        co.api_root = config.general.api_root;
    }

    let profile = config.general?.profile;
    if (kwargs?.profile) {
        profile = kwargs.profile;
    }

    const userProfile = config[`profile:${profile}`];
    if (userProfile) {
        if (userProfile.api_root) {
            co.api_root = userProfile.api_root;
        }
        co.token = userProfile.token;
        co.username = userProfile.username;
        co.ignore_ssl_warn = userProfile.ignore_ssl_warn === "true";
    } else {
        return [true, co];
    }

    if (kwargs?.api_root) {
        co.api_root = kwargs.api_root;
    }
    if (kwargs?.token) {
        co.token = kwargs.token;
    }
    co.profile = profile;

    return [true, co];
}

export interface UserConfig {
    token?: string;
    // ... add other properties as needed
}
