import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
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
        avatar?: String;
        bio?: String;
        chat?: String;
        email?: String;
        member_since?: String;
        name?: String;
        subscription?: String;
        username?: String;
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

    console.debug('opening file', configPath);
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

export function typeToIcon(visType: string, pt?: string) {
    if (pt === 'm') return 'mail';

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
        text: 'book',
    };

    // Normalize the input string
    const normalizedType = visType.toLowerCase();

    // Return the corresponding icon or a default icon if the chart type is not recognized
    return chartIcons[normalizedType] || 'default_icon_path';
}
