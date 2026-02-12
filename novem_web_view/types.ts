export interface ViewData {
    visId: string;
    uri: string;
    shortname: string;
    route: string;
    token: string;
    apiRoot: string;
    username?: string;
}
interface Creator {
    username: string;
    name: string;
    avatar: string;
}
interface About {
    shortname: string;
    name: string;
    created: string;
    uri_vis: string;
    uri_img: string;
    uri_pdf: string;
    vis_type: string;
    description: string;
    summary: string;
}
interface Recipient {
    id: string;
    name: string;
    path: string;
}
interface RecipientEntry {
    recipient: Recipient;
    type: string; // if there's a limited set of possible strings, use union type instead, e.g., type: "user" | "admin" | ...;
}
interface Recipients {
    cc: RecipientEntry[] | null;
    to: RecipientEntry[] | null;
}

export interface FetchedData {
    data: any[];
    metadata: Record<string, unknown>;
    config: Record<string, unknown>;
    creator: Creator;
    references: any;
    about: About;
    recipients: Recipients;
}

export interface VscodeApi {
    postMessage(message: any, targetOrigin: string, transfer?: Transferable[]): void;
}
