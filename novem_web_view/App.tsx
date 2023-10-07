import axios from 'axios';
import React, { createContext, useContext, useEffect, useState } from 'react';

import {
    BrowserRouter as Router,
    Route,
    Routes,
    useNavigate,
} from 'react-router-dom';

import {
    NovemLoading,
    NovemViewMail,
    NovemViewPlot,
    NovemViewProfile,
} from './components';

import { enforceStyles } from './utils';
import { ViewData, FetchedData } from './types';

const MainContent = () => {
    const navigate = useNavigate();

    const [viewData, setViewData] = useState<ViewData>({
        visId: '',
        uri: '',
        shortname: '',
        route: '',
        token: '',
        apiRoot: '',
        ignoreSslWarn: false,
    });

    const { visId, uri, shortname, route, token, apiRoot, ignoreSslWarn } =
        viewData;
    const [fetchedData, setFetchedData] = useState<FetchedData | null>(null);

    useEffect(() => {
        enforceStyles();
    }, []);

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
                        ignoreSslWarn: message.ignoreSslWarn,
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
                // IF ignoreSslWarn is true then don't fail on invalid certificate

                let reqApiRoot: string = apiRoot || '';

                if (ignoreSslWarn && apiRoot) {
                    reqApiRoot = (apiRoot as string).replace('https', 'http');
                }

                try {
                    const response = await axios.get(
                        `${reqApiRoot}i/${shortname}`,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                        },
                    );

                    setFetchedData(response.data);
                    console.log(response.data);
                } catch (error) {
                    console.error('Error fetching data:', error);
                }
            }
        })();
    }, [token, apiRoot, shortname]);

    if (!fetchedData) return <NovemLoading />;

    return (
        <Routes>
            <Route
                path="/plots"
                element={
                    <NovemViewPlot
                        fetchedData={fetchedData}
                        viewData={viewData}
                    />
                }
            />
            <Route
                path="/mails"
                element={
                    <NovemViewMail
                        fetchedData={fetchedData}
                        viewData={viewData}
                    />
                }
            />
            <Route path="/profile" Component={NovemViewProfile} />
            <Route
                path="/"
                element={<div>Hello World from Novem Web View!</div>}
            />
        </Routes>
    );
};

const App = () => {
    return (
        <Router>
            <MainContent />
        </Router>
    );
};

export default App;
