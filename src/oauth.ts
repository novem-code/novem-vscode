import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { writeConfig, getCurrentConfig, setActiveProfile } from './config';

const CLIENT_ID = 'novem-vscode';
const REDIRECT_URI = 'vscode://novem.novem-vscode/oauth/callback';

interface OAuthState {
    codeVerifier: string;
    state: string;
    apiRoot: string;
    profileName?: string;
    resolve: (value: boolean) => void;
}

let pendingAuth: OAuthState | null = null;

function generatePKCE(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

/**
 * Start the OAuth login flow: opens the system browser to the Novem
 * login page, then waits for the URI callback.
 *
 * - `profileName` is passed through verbatim. Pass `undefined` to derive the
 *   profile name from the OAuth-returned username (new profile flow).
 * - `apiRootOverride` overrides the api_root for this login only. When unset,
 *   the current active profile's api_root is used, falling back to novem.io.
 */
export async function startOAuthLogin(
    opts: { profileName?: string; apiRootOverride?: string } = {},
): Promise<boolean> {
    const apiRoot =
        opts.apiRootOverride || getCurrentConfig()?.api_root || 'https://api.novem.io/v1/';

    // Derive OAuth base from api_root (e.g. https://api.novem.io/v1/ → https://api.novem.io)
    const url = new URL(apiRoot);
    const oauthBase = `${url.protocol}//${url.host}`;

    const { verifier, challenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString('base64url');

    return new Promise<boolean>(resolve => {
        pendingAuth = {
            codeVerifier: verifier,
            state,
            apiRoot,
            profileName: opts.profileName,
            resolve,
        };

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
        });

        const authorizeUrl = `${oauthBase}/oauth/authorize?${params.toString()}`;
        // Use Uri.parse with strict=true to preserve percent-encoding in the query string
        vscode.env.openExternal(vscode.Uri.parse(authorizeUrl, true));
    });
}

/**
 * Handle the OAuth callback URI: vscode://novem.novem-vscode/oauth/callback?code=...&state=...
 */
export async function handleOAuthCallback(uri: vscode.Uri): Promise<void> {
    if (!pendingAuth) {
        vscode.window.showErrorMessage('No pending OAuth login. Please try again.');
        return;
    }

    const params = new URLSearchParams(uri.query);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    const auth = pendingAuth;
    pendingAuth = null;

    if (error) {
        const desc = params.get('error_description') || error;
        vscode.window.showErrorMessage(`Authentication failed: ${desc}`);
        auth.resolve(false);
        return;
    }

    if (!code) {
        vscode.window.showErrorMessage('No authorization code received.');
        auth.resolve(false);
        return;
    }

    if (state !== auth.state) {
        vscode.window.showErrorMessage('State mismatch — possible CSRF attack.');
        auth.resolve(false);
        return;
    }

    // Derive OAuth base from apiRoot
    const url = new URL(auth.apiRoot);
    const oauthBase = `${url.protocol}//${url.host}`;

    try {
        // Exchange code for token
        const tokenResp = await fetch(`${oauthBase}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: CLIENT_ID,
                code_verifier: auth.codeVerifier,
                redirect_uri: REDIRECT_URI,
            }).toString(),
        });

        if (!tokenResp.ok) {
            const err = await tokenResp.json().catch(() => ({}));
            throw new Error(err.error_description || `HTTP ${tokenResp.status}`);
        }

        const tokenData = await tokenResp.json();
        const token = tokenData.access_token;

        // Fetch username via /whoami
        const whoamiResp = await fetch(`${auth.apiRoot.replace(/\/$/, '')}/whoami`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!whoamiResp.ok) {
            throw new Error('Failed to fetch user info');
        }

        const username = (await whoamiResp.text()).trim();

        // Fetch token metadata
        let tokenName = 'oauth-vscode';
        try {
            const tokenInfoResp = await fetch(`${auth.apiRoot.replace(/\/$/, '')}/token`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (tokenInfoResp.ok) {
                const tokenInfo = await tokenInfoResp.json();
                tokenName = tokenInfo.token_name || tokenName;
            }
        } catch {
            // use default token_name
        }

        // Write config and switch the active VS Code profile to the one we
        // just wrote. updateConfigForProfile only sets app:vscode.profile when
        // unset, so an existing logged-in session would otherwise stay on the
        // old profile after creating a new one.
        const profileKey = auth.profileName || username;
        await writeConfig({
            username,
            token,
            token_name: tokenName,
            api_root: auth.apiRoot,
            profile: profileKey,
        });
        await setActiveProfile(profileKey);

        vscode.window.showInformationMessage(`Signed in as ${username}`);
        vscode.commands.executeCommand('workbench.action.reloadWindow');
        auth.resolve(true);
    } catch (err: any) {
        vscode.window.showErrorMessage(`OAuth login failed: ${err.message}`);
        auth.resolve(false);
    }
}

/**
 * VS Code URI handler — routes incoming vscode:// URIs.
 */
export class NovemUriHandler implements vscode.UriHandler {
    handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
        if (uri.path === '/oauth/callback') {
            handleOAuthCallback(uri);
        }
    }
}
