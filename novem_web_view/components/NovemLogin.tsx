import React, { FormEvent, useEffect, useState } from 'react';
import { VscodeApi } from '../types';

import './NovemLogin.css';

export default function NovemLogin(props: { vsapi: VscodeApi }) {
    const [progress, setProgress] = useState<
        'idle' | 'loggingIn' | 'error' | 'success'
    >('idle');

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const onclick = async (e: FormEvent) => {
        e.preventDefault();

        setProgress('loggingIn');
        let data: any;
        try {
            const response = await fetch('https://api.novem.io/v1/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password,
                    token_name:
                        'novem_vscode_extension-' +
                        Math.random().toString(36).substring(2, 7),
                    token_description:
                        'Novem VSCode Extension token created at ' +
                        new Date().toISOString(),
                }),
            });

            if (!response.ok) {
                const errorText = await response
                    .text()
                    .catch(() => 'Unknown error');
                console.error(
                    `Login failed: HTTP ${response.status} - ${errorText}`,
                );
                setProgress('error');
                return;
            }

            data = await response.json();
        } catch (e) {
            console.error('Login error:', e);
            setProgress('error');
            return;
        }

        console.log(data);
        setProgress('success');

        props.vsapi.postMessage(
            {
                command: 'signinSuccessful',
                token: data.token,
                token_id: data.token_id,
                token_name: data.token_name,
                username: username,
            },
            '*',
        );
    };

    const notice = (() => {
        switch (progress) {
            case 'error':
                return (
                    <p className="login-error">
                        Login failed. Please verify your username and password.
                    </p>
                );
            case 'success':
                return <p className="login-success">Success!</p>;
            case 'loggingIn':
                return <p className="login-progress">Logging you in…</p>;
            case 'idle':
                return null;
        }
    })();

    return (
        <div className="gradient">
            <div className="login-body">
                <form>
                    <h2>Login to novem</h2>
                    <div className="form-row">
                        <label htmlFor="floatingInput">Username</label>
                        <input
                            type="text"
                            id="floatingInput"
                            placeholder="example"
                            value={username}
                            onChange={(e) => void setUsername(e.target.value)}
                        />
                    </div>
                    <div className="form-row">
                        <label htmlFor="floatingPassword">Password</label>
                        <input
                            type="password"
                            id="floatingPassword"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => void setPassword(e.target.value)}
                        />
                    </div>
                    <button type="submit" onClick={onclick}>
                        Login
                    </button>
                    {notice}
                </form>
            </div>
        </div>
    );
}
