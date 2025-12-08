import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as fsa from 'fs/promises';
import * as ini from 'ini';

const NOVEM_PATH = 'novem';
const NOVEM_NAME = 'novem.conf';

export interface UserConfig {
    token?: string;
    api_root?: string;
    ignore_ssl_warn?: boolean;
    // ... add other properties as needed
}

export interface UserProfile {
    user_info: {
        avatar?: string;
        bio?: string;
        chat?: string;
        email?: string;
        member_since?: string;
        name?: string;
        subscription?: string;
        username?: string;
    };
    // ... add other properties as needed
}

export interface VisInfo {
    created: string;
    id: string;
    name: string;
    shortname: string;
    summary: string;
    type: string;
    uri: string;
    vis_type: string;
}

export function getUserConfigDirectory(): string {
    if (os.platform() === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA;
        if (localAppData) {
            return localAppData;
        }
        throw new Error('Unable to find a suitable configuration directory.');
    } else {
        const xdgConfigHome = process.env.XDG_CONFIG_HOME;
        if (xdgConfigHome) {
            return xdgConfigHome;
        }
        return path.join(os.homedir(), '.config');
    }
}

export function getConfigPath(): { dir: string; config: string } {
    const configPath = getUserConfigDirectory();
    if (!configPath)
        throw new Error('Unable to find a suitable configuration directory.');
    const novemDir = path.join(configPath, NOVEM_PATH);
    const novemConfig = path.join(configPath, NOVEM_PATH, NOVEM_NAME);
    return { dir: novemDir, config: novemConfig };
}

export function getCurrentConfig(kwargs?: {
    config_path?: string;
    ignore_config?: boolean;
    api_root?: string;
    profile?: string;
    token?: string;
}): UserConfig | null {
    const configPath = kwargs?.config_path || getConfigPath().config;

    const co: { [key: string]: any } = {};

    if (kwargs?.ignore_config) {
        if (kwargs.api_root) {
            co.api_root = kwargs.api_root;
        }
        return co;
    }

    if (!fs.existsSync(configPath)) {
        return null;
    }

    // console.debug('opening file', configPath);
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return parseConfig(configContent, kwargs);
}

export function parseConfig(
    configContent: string,
    kwargs?: { api_root?: string; profile?: string; token?: string },
): UserConfig {
    const config = ini.parse(configContent);

    const co: { [key: string]: any } = {};
    if (kwargs?.api_root) {
        co.api_root = kwargs.api_root;
    } else if (config.general && config.general.api_root) {
        co.api_root = config.general.api_root;
    }

    let profile = config['app:vscode']?.profile || config.general?.profile;
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
        co.ignore_ssl_warn = userProfile.ignore_ssl_warn === true;
    } else {
        return co;
    }

    if (kwargs?.api_root) {
        co.api_root = kwargs.api_root;
    }

    if (kwargs?.token) {
        co.token = kwargs.token;
    }
    co.profile = profile;

    return co;
}

// helpful icon lookup: https://microsoft.github.io/vscode-codicons/dist/codicon.html
export function typeToIcon(visType: string, type?: 'mails' | 'plots') {
    if (type === 'mails') return 'mail';

    // Use a consistent chart icon for all plot types
    return 'graph';
}

export async function writeConfig(data: {
    username: string;
    token: string;
    token_name: string;
}) {
    const path = getConfigPath();

    const exists =
        fs.existsSync(path.config) && (await fsa.stat(path.config)).isFile();

    const config = {
        general: {
            profile: data.username,
            api_root: 'https://api.novem.io/v1/',
        },
        [`profile:${data.username}`]: {
            username: data.username,
            token_name: data.token_name,
            token: data.token,
        },
    };

    const serialized = ini.stringify(config, { whitespace: true });
    console.log(serialized);

    if (exists) {
        // Config file already exists. Probably a bad token. Do a backup for the old file and write new.
        // TODO we should edit the existing file instead of overwriting it, in case the user has other profiles
        const timestamp = new Date()
            .toISOString()
            .replace(/[-:.]/g, '')
            .replace('T', '-')
            .slice(0, -4);
        const backupPath = path.config + '.bak_' + timestamp;
        await fsa.rename(path.config, backupPath);
        console.log('Config file already exists, overwriting');
    }

    await fsa.mkdir(path.dir, { recursive: true });
    await fsa.writeFile(path.config, serialized);
}

/**
 * Get all available profiles from the config file
 */
export function getAvailableProfiles(): string[] {
    const configPath = getConfigPath().config;

    if (!fs.existsSync(configPath)) {
        return [];
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = ini.parse(configContent);

    const profiles: string[] = [];
    for (const key in config) {
        if (key.startsWith('profile:')) {
            profiles.push(key.substring('profile:'.length));
        }
    }

    return profiles;
}

/**
 * Get the currently active profile for VS Code
 * Falls back to the general profile if VS Code-specific profile is not set
 */
export function getActiveProfile(): string | null {
    const configPath = getConfigPath().config;

    if (!fs.existsSync(configPath)) {
        return null;
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = ini.parse(configContent);

    // Check for VS Code-specific profile first
    const vscodeProfile = config['app:vscode']?.profile;
    if (vscodeProfile) {
        return vscodeProfile;
    }

    // Fall back to general profile
    return config.general?.profile || null;
}

/**
 * Set the active profile for VS Code
 */
export async function setActiveProfile(profileName: string): Promise<void> {
    const path = getConfigPath();

    if (!fs.existsSync(path.config)) {
        throw new Error('Config file does not exist');
    }

    const configContent = fs.readFileSync(path.config, 'utf-8');
    const config = ini.parse(configContent);

    // Verify the profile exists
    if (!config[`profile:${profileName}`]) {
        throw new Error(`Profile '${profileName}' does not exist`);
    }

    // Set or update the app:vscode section
    if (!config['app:vscode']) {
        config['app:vscode'] = {};
    }
    config['app:vscode'].profile = profileName;

    const serialized = ini.stringify(config, { whitespace: true });
    await fsa.writeFile(path.config, serialized);
}
