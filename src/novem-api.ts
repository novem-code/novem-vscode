import { UserProfile } from './config';

// Maps each visType to its API path prefix.
// Add new types here to extend support without touching call sites.
export const VIS_TYPE_PREFIX: Record<string, string> = {
    plots: '/vis/plots',
    mails: '/vis/mails',
    grids: '/vis/grids',
    docs: '/vis/docs',
    jobs: '/code/jobs',
    repos: '/code/repos',
};

function visTypePath(visType: string): string {
    return VIS_TYPE_PREFIX[visType] ?? `/vis/${visType}`;
}

// A user's resources across every type, fetched in one GraphQL round trip.
export interface VisAggregate {
    plots: any[];
    mails: any[];
    grids: any[];
    docs: any[];
    jobs: any[];
    repos: any[];
}

// Fields the sidebar + view pickers need per resource. The novem GraphQL
// schema (gaia/janus) exposes these uniformly across plots/mails/grids/docs/
// jobs/repos, so one selection works for all six.
const VIS_LIST_FIELDS = 'id name shortname url type summary created';
const AGG_SELECTION = (['plots', 'mails', 'grids', 'docs', 'jobs', 'repos'] as const)
    .map(t => `${t} { ${VIS_LIST_FIELDS} }`)
    .join('\n');

const EMPTY_AGGREGATE = (): VisAggregate => ({
    plots: [],
    mails: [],
    grids: [],
    docs: [],
    jobs: [],
    repos: [],
});

// GraphQL returns `url`; downstream code (view picker) expects `uri`. Mirror it
// and guarantee every list is an array.
function normalizeAggregate(raw: Partial<Record<keyof VisAggregate, any[]>> | null): VisAggregate {
    const out = EMPTY_AGGREGATE();
    if (!raw) return out;
    for (const key of Object.keys(out) as (keyof VisAggregate)[]) {
        const items = Array.isArray(raw[key]) ? raw[key]! : [];
        out[key] = items.map(item => ({ ...item, uri: item.uri ?? item.url }));
    }
    return out;
}

export default class NovemApi {
    private token: string;
    private apiRoot: string;
    private headers: { Authorization: string; Accept: string };

    // Memoised aggregate fetches so the four/six tree providers loading on
    // activation share a single GraphQL round trip instead of one each.
    private selfVisCache?: Promise<VisAggregate>;
    private userVisCache = new Map<string, Promise<VisAggregate>>();

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
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

        // Mutating endpoints (PATCH rename, POST /status, DELETE) often reply
        // with HTTP 2xx and an empty body. Treat that as a successful response
        // with no payload rather than failing on JSON.parse('').
        const text = await response.text();
        if (text.length === 0) {
            return undefined as T;
        }
        try {
            return JSON.parse(text) as T;
        } catch (error) {
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

    private async patch(url: string, data: string, headers?: Record<string, string>) {
        return this.makeRequest('PATCH', url, {
            body: data,
            headers: headers ?? { 'Content-Type': 'text/plain' },
        });
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

    // ── GraphQL aggregates ─────────────────────────────────────────────
    //
    // The sidebar lists (and the view pickers) use GraphQL to fetch every
    // resource type in a single round trip. Per-resource details and file
    // contents stay on REST (/i/, /vis/*, /code/*).

    // The GraphQL endpoint sits at the API origin (NOT under /v1).
    private gqlUrl(): string {
        return `${new URL(this.apiRoot).origin}/gql`;
    }

    private async gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
        let response: Response;
        try {
            response = await fetch(this.gqlUrl(), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query, variables }),
            });
        } catch (error) {
            throw new Error(
                `GraphQL network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }

        if (!response.ok) {
            throw new Error(`GraphQL HTTP ${response.status}: ${response.statusText}`);
        }

        const json = (await response.json()) as { data?: T; errors?: unknown };
        if (json.errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
        }
        return json.data as T;
    }

    /**
     * All of the authenticated user's own resources (including private),
     * fetched via `me { ... }` in one call and memoised for the session.
     * `username` is only used for the REST fallback if GraphQL is unavailable.
     */
    async getSelfVis(username: string): Promise<VisAggregate> {
        if (!this.selfVisCache) {
            this.selfVisCache = this.gql<{ me: any }>(`{ me { ${AGG_SELECTION} } }`)
                .then(data => normalizeAggregate(data?.me))
                .catch(async error => {
                    console.error('GraphQL me{} failed, falling back to REST lists:', error);
                    this.selfVisCache = undefined;
                    return this.restAggregateFallback(username);
                });
        }
        return this.selfVisCache;
    }

    /**
     * Another user's resources (public / shared-with-you), via
     * `users(username:) { ... }`. Memoised per username.
     */
    async getUserVis(username: string): Promise<VisAggregate> {
        let cached = this.userVisCache.get(username);
        if (!cached) {
            cached = this.gql<{ users: any[] }>(
                `query($u: String!) { users(username: $u) { ${AGG_SELECTION} } }`,
                { u: username },
            )
                .then(data => normalizeAggregate(data?.users?.[0]))
                .catch(async error => {
                    console.error(
                        `GraphQL users(${username}) failed, falling back to REST:`,
                        error,
                    );
                    this.userVisCache.delete(username);
                    return this.restAggregateFallback(username);
                });
            this.userVisCache.set(username, cached);
        }
        return cached;
    }

    /** Clear memoised aggregates (called on refresh / profile switch). */
    invalidateVisCache(): void {
        this.selfVisCache = undefined;
        this.userVisCache.clear();
    }

    // REST fallback so a GraphQL hiccup never blanks the sidebar.
    private async restAggregateFallback(username: string): Promise<VisAggregate> {
        const safe = (p: Promise<any>) => p.then(r => (Array.isArray(r) ? r : [])).catch(() => []);
        const [plots, mails, grids, docs, jobs, repos] = await Promise.all([
            safe(this.getPlotsForUser(username)),
            safe(this.getMailsForUser(username)),
            safe(this.getGridsForUser(username)),
            safe(this.getDocsForUser(username)),
            safe(this.getJobsForUser(username)),
            safe(this.getReposForUser(username)),
        ]);
        return { plots, mails, grids, docs, jobs, repos };
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

    async getGridsForUser(user: string) {
        return await this.get(`${this.apiRoot}/u/${user}/g`);
    }

    async getDocsForUser(user: string) {
        return await this.get(`${this.apiRoot}/u/${user}/d`);
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
    async createGrid(gridId: string) {
        return await this.put(`${this.apiRoot}/vis/grids/${gridId}`, null);
    }
    async createDoc(docId: string) {
        return await this.put(`${this.apiRoot}/vis/docs/${docId}`, null);
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

    async getDetailsForVis(
        type: 'mails' | 'plots' | 'grids' | 'docs',
        visId: string,
        path?: string,
    ) {
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

    async deleteResource(visType: string, id: string) {
        return await this.delete(`${this.apiRoot}${visTypePath(visType)}/${id}`);
    }

    /**
     * Rename a resource by PATCH-ing its top-level URI with the new name as
     * a text/plain body. Mirrors the rename verb used by novem-tui.
     */
    async renameResource(visType: string, id: string, newName: string) {
        return await this.patch(`${this.apiRoot}${visTypePath(visType)}/${id}`, newName);
    }

    /** POST /status=sending to trigger an actual mail send. */
    async sendMail(mailId: string) {
        return await this.post(`${this.apiRoot}/vis/mails/${mailId}/status`, 'sending', {
            'Content-Type': 'text/plain',
        });
    }

    /** POST /status=testing to send the mail to its creator as a preview. */
    async testMail(mailId: string) {
        return await this.post(`${this.apiRoot}/vis/mails/${mailId}/status`, 'testing', {
            'Content-Type': 'text/plain',
        });
    }

    /** POST /data={} to trigger a job run. */
    async runJob(jobId: string) {
        return await this.post(`${this.apiRoot}/code/jobs/${jobId}/data`, '{}', {
            'Content-Type': 'application/json',
        });
    }

    async readFile(visType: string, path: string) {
        try {
            return await this.get(`${this.apiRoot}${visTypePath(visType)}${path}`, false);
        } catch (e) {
            console.error('Error fetching data', e);
        }
    }

    async writeFile(visType: string, path: string, content: string) {
        try {
            const contentType =
                visType === 'jobs' && path.match(/^\/[^/]+\/data$/)
                    ? 'application/json'
                    : 'text/plain';
            return await this.post(`${this.apiRoot}${visTypePath(visType)}${path}`, content, {
                'Content-Type': contentType,
            });
        } catch (e) {
            console.error('Error posting data', e);
        }
    }

    async createNodeInDirectory(visType: string, path: string) {
        try {
            return await this.put(`${this.apiRoot}${visTypePath(visType)}${path}`, null);
        } catch (e) {
            console.error('Error creating node', e);
            throw e;
        }
    }

    async deleteNode(visType: string, path: string) {
        try {
            return await this.delete(`${this.apiRoot}${visTypePath(visType)}${path}`);
        } catch (e) {
            console.error('Error deleting node', e);
            throw e;
        }
    }
}
