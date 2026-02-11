import { UserProfile } from './config';

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
            const errorText = await response
                .text()
                .catch(() => 'Unknown error');
            console.error(
                `HTTP ${response.status} error ${method} ${url}:`,
                errorText,
            );
            throw new Error(
                `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
            );
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
            const text = await response
                .text()
                .catch(() => '[Unable to read response]');
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
        return await this.get<UserProfile>(
            `${this.apiRoot}/admin/profile/overview`,
        );
    }

    async getApiRoot() {
        return await this.get(`${this.apiRoot}/`);
    }

    async getMailsForUser(user: string) {
        return await this.get(`${this.apiRoot}/u/${user}/m`);
    }

    async getPlotsForUser(user: string) {
        return await this.get(`${this.apiRoot}/u/${user}/p`);
    }

    async getJobsForUser(user: string) {
        return await this.get(`${this.apiRoot}/jobs`);
    }

    async getReposForUser(user: string) {
        return await this.get(`${this.apiRoot}/repos`);
    }

    async createPlot(plotId: string) {
        return await this.put(`${this.apiRoot}/vis/plots/${plotId}`, null);
    }
    async createMail(mailId: string) {
        return await this.put(`${this.apiRoot}/vis/mails/${mailId}`, null);
    }
    async createJob(jobId: string) {
        return await this.put(`${this.apiRoot}/jobs/${jobId}`, null);
    }
    async createRepo(repoId: string) {
        return await this.put(`${this.apiRoot}/repos/${repoId}`, null);
    }
    async modifyPlot(plotId: string, key: string, value: string) {
        return await this.post(
            `${`${this.apiRoot}/vis/plots/${plotId}`}/${key}`,
            value,
            {
                'Content-Type': 'text/plain', // Set content type as text/plain
            },
        );
    }

    async getDetailsForVis(
        type: 'mails' | 'plots',
        visId: string,
        path?: string,
    ) {
        if (path)
            return await this.get(
                `${this.apiRoot}/vis/${type}/${visId}/${path}`,
            );
        else return await this.get(`${this.apiRoot}/vis/${type}/${visId}`);
    }

    async getDetailsForJob(jobId: string, path?: string) {
        if (path)
            return await this.get(`${this.apiRoot}/jobs/${jobId}/${path}`);
        else return await this.get(`${this.apiRoot}/jobs/${jobId}`);
    }

    async getDetailsForRepo(repoId: string, path?: string) {
        if (path)
            return await this.get(`${this.apiRoot}/repos/${repoId}/${path}`);
        else return await this.get(`${this.apiRoot}/repos/${repoId}`);
    }

    async deletePlot(plotId: string) {
        return await this.delete(`${this.apiRoot}/vis/plots/${plotId}`);
    }

    async deleteJob(jobId: string) {
        return await this.delete(`${this.apiRoot}/jobs/${jobId}`);
    }

    async deleteRepo(repoId: string) {
        return await this.delete(`${this.apiRoot}/repos/${repoId}`);
    }

    async readFile(path: string) {
        //console.log('reading file', path);
        try {
            // Don't use Accept: application/json for file content
            // Jobs and repos are top-level, not under /vis/
            if (path.startsWith('/jobs/') || path.startsWith('/repos/')) {
                return await this.get(`${this.apiRoot}${path}`, false);
            }
            return await this.get(
                `${this.apiRoot}/vis/${path.slice(1)}`,
                false,
            );
        } catch (e) {
            console.error('Error fetching data', e);
        }
    }

    async writeFile(path: string, content: string) {
        //console.log('writing file', path, content);
        try {
            // Determine content type based on path
            let contentType = 'text/plain';

            // Job data files should be sent as application/json
            if (path.match(/^\/jobs\/[^/]+\/data$/)) {
                contentType = 'application/json';
            }

            // Jobs and repos are top-level, not under /vis/
            if (path.startsWith('/jobs/') || path.startsWith('/repos/')) {
                return await this.post(`${this.apiRoot}${path}`, content, {
                    'Content-Type': contentType,
                });
            }
            return await this.post(
                `${this.apiRoot}/vis/${path.slice(1)}`,
                content,
                {
                    'Content-Type': 'text/plain', // Set content type as text/plain
                },
            );
        } catch (e) {
            console.error('Error posting data', e);
        }
    }

    async createNodeInDirectory(path: string) {
        //console.log('creating node in directory', path);
        try {
            // Jobs and repos are top-level, not under /vis/
            if (path.startsWith('/jobs/') || path.startsWith('/repos/')) {
                return await this.put(`${this.apiRoot}${path}`, null);
            }
            return await this.put(`${this.apiRoot}/vis/${path.slice(1)}`, null);
        } catch (e) {
            console.error('Error creating node', e);
            throw e;
        }
    }

    async deleteNode(path: string) {
        //console.log('deleting node', path);
        try {
            // Jobs and repos are top-level, not under /vis/
            if (path.startsWith('/jobs/') || path.startsWith('/repos/')) {
                return await this.delete(`${this.apiRoot}${path}`);
            }
            return await this.delete(`${this.apiRoot}/vis/${path.slice(1)}`);
        } catch (e) {
            console.error('Error deleting node', e);
            throw e;
        }
    }
}
