import React, { createContext, useContext, useEffect, useState } from 'react';

import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';

import {
    NovemViewMail,
    NovemViewPlot,
    NovemViewGrid,
    NovemViewDoc,
    NovemViewProfile,
} from './components';

import { ViewData, FetchedData, VscodeApi } from './types';

const MainContent = (props: { vsapi: VscodeApi }) => {
    const navigate = useNavigate();

    const [viewData, setViewData] = useState<ViewData>({
        visId: '',
        uri: '',
        shortname: '',
        route: '',
        token: '',
        apiRoot: '',
        username: '',
    });

    const { visId, uri, shortname, route, token, apiRoot } = viewData;
    const [fetchedData, setFetchedData] = useState<FetchedData | null>(null);

    // Bumped by the chrome refresh button. Re-fetches the resource metadata
    // (name/avatar may have changed) AND re-registers the vis (via the
    // refreshKey passed down to useNsRegistration).
    const [refreshKey, setRefreshKey] = useState(0);
    const onRefresh = () => setRefreshKey(k => k + 1);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.command) {
                case 'navigate':
                    //console.log('navigate', message);
                    setViewData({
                        route: message.route,
                        visId: message.visId,
                        uri: message.uri,
                        shortname: message.shortName,
                        token: message.token,
                        apiRoot: message.apiRoot,
                        username: message.username,
                    });
                    navigate(message.route);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => void window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        (async function () {
            if (token && apiRoot && shortname) {
                try {
                    const response = await fetch(`${apiRoot || ''}/i/${shortname}`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Unknown error');
                        throw new Error(
                            `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
                        );
                    }

                    const data = await response.json();
                    setFetchedData(data);
                    console.log(data);
                } catch (error) {
                    console.error('Error fetching data:', error);
                    // Could set an error state here to show user-friendly error message
                }
            }
        })();
    }, [token, apiRoot, shortname, refreshKey]);

    const viewProps = {
        fetchedData: fetchedData || undefined,
        viewData,
        refreshKey,
        onRefresh,
    };

    return (
        <Routes>
            <Route path="/plots" element={<NovemViewPlot {...viewProps} />} />
            <Route path="/mails" element={<NovemViewMail {...viewProps} />} />
            <Route path="/grids" element={<NovemViewGrid {...viewProps} />} />
            <Route path="/docs" element={<NovemViewDoc {...viewProps} />} />
            <Route path="/profile" Component={NovemViewProfile} />
            <Route path="/" element={<div>Hello World from Novem Web View!</div>} />
        </Routes>
    );
};

const App = () => {
    const [vscodeApi, setVscodeApi] = useState<VscodeApi>();
    useEffect(() => {
        const vscode: VscodeApi = (global as any).acquireVsCodeApi();
        setVscodeApi(vscode);
        vscode.postMessage({ command: 'contentReady' }, '*');
    }, []);

    if (!vscodeApi) return null;

    return (
        <Router>
            <MainContent vsapi={vscodeApi} />
        </Router>
    );
};

export default App;
