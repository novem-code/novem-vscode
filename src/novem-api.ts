import axios from 'axios';
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

    private async get<T = any>(url: string) {
        return (
            await axios.get<T>(url, {
                headers: this.headers,
            })
        ).data;
    }

    private async post(url: string, data: any, headers: any | null) {
        return (
            await axios.post(url, data, {
                headers: { ...this.headers, ...headers },
            })
        ).data;
    }

    private async put(url: string, data: any) {
        return (
            await axios.put(url, data, {
                headers: this.headers,
            })
        ).data;
    }

    private async delete(url: string) {
        return (
            await axios.delete(url, {
                headers: this.headers,
            })
        ).data;
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

    async getVisualizationsForUser(user: string) {
        return await this.get(`${this.apiRoot}/u/${user}/v`);
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
            // Jobs and repos are top-level, not under /vis/
            if (path.startsWith('/jobs/') || path.startsWith('/repos/')) {
                return await this.get(`${this.apiRoot}${path}`);
            }
            return await this.get(`${this.apiRoot}/vis/${path.slice(1)}`);
        } catch (e) {
            console.error('Error fetching data', e);
        }
    }

    async writeFile(path: string, content: string) {
        //console.log('writing file', path, content);
        try {
            // Jobs and repos are top-level, not under /vis/
            if (path.startsWith('/jobs/') || path.startsWith('/repos/')) {
                return await this.post(
                    `${this.apiRoot}${path}`,
                    content,
                    {
                        'Content-Type': 'text/plain',
                    },
                );
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
            return await this.put(
                `${this.apiRoot}/vis/${path.slice(1)}`,
                null,
            );
        } catch (e) {
            console.error('Error creating node', e);
            throw e;
        }
    }
}
