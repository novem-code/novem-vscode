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
    co.ignore_ssl_warn = false;

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

    // Define a lookup object
    const chartIcons: Record<string, string> = {
        sbar: 'graph',
        gbar: 'graph',
        bar: 'graph',
        line: 'graph-line',
        mline: 'graph-line',
        table: 'table',
        mtable: 'table',
        pie: 'pie-chart',
        donut: 'pie-chart',
        scatter: 'graph-scatter',
        text: 'book',
    };

    try {
        // Normalize the input string
        const normalizedType = visType.toLowerCase();

        // Return the corresponding icon or a default icon if the chart type is not recognized
        return chartIcons[normalizedType] || 'blank';
    } catch (error) {
        //console.error('Error!', error);
        return 'blank';
    }
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
            api_root: 'https://api.novem.no/v1/',
        },
        [`profile:${data.username}`]: {
            username: data.username,
            token_name: data.token_name,
            token: data.token,
        },
    };

    const serialized = ini.stringify(config);
    console.log(serialized);

    if (exists) {
        // Config file already exists. Probably a bad token, lets overwrite it.
        console.log('Config file already exists, overwriting');
    }

    await fsa.mkdir(path.dir, { recursive: true });
    await fsa.writeFile(path.config, serialized);
}
