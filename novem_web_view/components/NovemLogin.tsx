import axios, { AxiosResponse } from 'axios';
import React, { FormEvent, useEffect, useState } from 'react';
import { VscodeApi } from '../types';

import './NovemLogin.css';

export default function NovemLogin(props: { vsapi: VscodeApi }) {
    const [progress, setProgress] = useState<
        'idle' | 'loggingIn' | 'error' | 'success'
    >('idle');
    const [loginSuccess, setLoginSuccess] = useState(false);

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const onclick = async (e: FormEvent) => {
        e.preventDefault();

        setProgress('loggingIn');
        let response: AxiosResponse;
        try {
            response = await axios.post('https://api.novem.no/v1/token', {
                username,
                password,
                token_name: 'novem_vscode_extension',
                token_description:
                    'Novem VSCode Extension token created at ' +
                    new Date().toISOString(),
            });
        } catch (e) {
            setProgress('error');
            return;
        }

        console.log(response.data);
        setProgress('success');

        props.vsapi.postMessage(
            {
                command: 'signinSuccessful',
                token: response.data.token,
                token_id: response.data.token_id,
                token_name: response.data.token_name,
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
                        We could not log in. Please verify your username and
                        password.
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
        <div className="login-body">
            <form>
                <h2>Login</h2>
                <p>Please enter your login and password</p>
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
    );
}
