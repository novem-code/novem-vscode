import { UserProfile } from './config';

// Maps each visType to its API path prefix.
// Add new types here to extend support without touching call sites.
export const VIS_TYPE_PREFIX: Record<string, string> = {
    plots: '/vis/plots',
    mails: '/vis/mails',
    jobs: '/code/jobs',
    repos: '/code/repos',
};

export function visTypePath(visType: string): string {
    return VIS_TYPE_PREFIX[visType] ?? `/vis/${visType}`;
}

export default class NovemApi {
    private token: string;
    private apiRoot: string;
    private headers: { Authorization: string; Accept: string };

    constructor(apiRoot: string, token: string) {
        this.apiRoot = apiRoot;
        this.token = token;

        if (this.apiRoot.endsWith('/')) {
            this.apiRoot = this.apiRoot.slice(0, -1);
        }

        this.headers = {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
        };
    }

    private async makeRequest<T = any>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        url: string,
        options: {
            body?: any;
            headers?: Record<string, string>;
            expectJson?: boolean;
        } = {},
    ): Promise<T> {
        const { body, headers: additionalHeaders, expectJson = true } = options;

        const headers = expectJson
            ? { ...this.headers, ...additionalHeaders }
            : {
                  Authorization: this.headers.Authorization,
                  ...additionalHeaders,
              };

        let response: Response;
        try {
            response = await fetch(url, {
                method,
                headers,
                body,
            });
        } catch (error) {
            console.error(`Network error ${method} ${url}:`, error);
            throw new Error(
                `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`HTTP ${response.status} error ${method} ${url}:`, errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        if (!expectJson) {
            try {
                return (await response.text()) as T;
            } catch (error) {
                console.error(`Error reading text from ${url}:`, error);
                throw new Error(
                    `Failed to read response as text: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
            }
        }

        try {
            return (await response.json()) as T;
        } catch (error) {
            const text = await response.text().catch(() => '[Unable to read response]');
            console.error(
                `JSON parsing error for ${url}:`,
                error,
                'Response:',
                text.substring(0, 200),
            );
            throw new Error(
                `Invalid JSON response from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    private async get<T = any>(url: string, acceptJson: boolean = true) {
        return this.makeRequest<T>('GET', url, { expectJson: acceptJson });
    }

    private async post(url: string, data: any, headers: any | null = null) {
        return this.makeRequest('POST', url, {
            body: data,
            headers: headers || undefined,
        });
    }

    private async put(url: string, data: any) {
        return this.makeRequest('PUT', url, { body: data });
    }

    private async delete(url: string) {
        return this.makeRequest('DELETE', url);
    }

    async logout() {
        return await this.post(`${this.apiRoot}/logout`, null, {});
    }

    async getProfile() {
        return await this.get<UserProfile>(`${this.apiRoot}/admin/profile/overview`);
    }

    async getApiRoot() {
        return await this.get(`${this.apiRoot}/`);
    }

    async getCodeRoot() {
        return await this.get(`${this.apiRoot}/code`);
    }

    async getMailsForUser(user: string) {
        return await this.get(`${this.apiRoot}/u/${user}/m`);
    }

    async getPlotsForUser(user: string) {
        return await this.get(`${this.apiRoot}/u/${user}/p`);
    }

    async getJobsForUser(user: string) {
        return await this.get(`${this.apiRoot}/code/jobs`);
    }

    async getReposForUser(user: string) {
        return await this.get(`${this.apiRoot}/code/repos`);
    }

    async createPlot(plotId: string) {
        return await this.put(`${this.apiRoot}/vis/plots/${plotId}`, null);
    }
    async createMail(mailId: string) {
        return await this.put(`${this.apiRoot}/vis/mails/${mailId}`, null);
    }
    async createJob(jobId: string) {
        return await this.put(`${this.apiRoot}/code/jobs/${jobId}`, null);
    }
    async createRepo(repoId: string) {
        return await this.put(`${this.apiRoot}/code/repos/${repoId}`, null);
    }
    async modifyPlot(plotId: string, key: string, value: string) {
        return await this.post(`${`${this.apiRoot}/vis/plots/${plotId}`}/${key}`, value, {
            'Content-Type': 'text/plain', // Set content type as text/plain
        });
    }

    async getDetailsForVis(type: 'mails' | 'plots', visId: string, path?: string) {
        if (path) return await this.get(`${this.apiRoot}/vis/${type}/${visId}/${path}`);
        else return await this.get(`${this.apiRoot}/vis/${type}/${visId}`);
    }

    async getDetailsForJob(jobId: string, path?: string) {
        if (path) return await this.get(`${this.apiRoot}/code/jobs/${jobId}/${path}`);
        else return await this.get(`${this.apiRoot}/code/jobs/${jobId}`);
    }

    async getDetailsForRepo(repoId: string, path?: string) {
        if (path) return await this.get(`${this.apiRoot}/code/repos/${repoId}/${path}`);
        else return await this.get(`${this.apiRoot}/code/repos/${repoId}`);
    }

    async deletePlot(plotId: string) {
        return await this.delete(`${this.apiRoot}/vis/plots/${plotId}`);
    }

    async deleteJob(jobId: string) {
        return await this.delete(`${this.apiRoot}/code/jobs/${jobId}`);
    }

    async deleteRepo(repoId: string) {
        return await this.delete(`${this.apiRoot}/code/repos/${repoId}`);
    }

    async readFile(path: string) {
        try {
            return await this.get(`${this.apiRoot}${path}`, false);
        } catch (e) {
            console.error('Error fetching data', e);
        }
    }

    async writeFile(path: string, content: string) {
        try {
            // Job data files should be sent as application/json
            const contentType = path.match(/^\/code\/jobs\/[^/]+\/data$/)
                ? 'application/json'
                : 'text/plain';
            return await this.post(`${this.apiRoot}${path}`, content, {
                'Content-Type': contentType,
            });
        } catch (e) {
            console.error('Error posting data', e);
        }
    }

    async createNodeInDirectory(path: string) {
        try {
            return await this.put(`${this.apiRoot}${path}`, null);
        } catch (e) {
            console.error('Error creating node', e);
            throw e;
        }
    }

    async deleteNode(path: string) {
        try {
            return await this.delete(`${this.apiRoot}${path}`);
        } catch (e) {
            console.error('Error deleting node', e);
            throw e;
        }
    }
}
