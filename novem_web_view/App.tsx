import React, { createContext, useContext, useEffect, useState } from 'react';

import NovemViewPlot from './components/NovemViewPlot';
import NovemViewMail from './components/NovemViewMail';
import NovemViewProfile from './components/NovemViewProfile';
import NovemLoading from './components/NovemLoading';

const App = () => {
    const [viewData, setViewData] = useState({
        visId: undefined,
        uri: undefined,
        shortname: undefined,
        route: undefined,
        token: undefined,
        apiRoot: undefined,
    });

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.command) {
                case 'navigate':
                    console.log('setting message')
                    console.log(message)
                    setViewData({
                        route: message.route,
                        visId: message.visId,
                        uri: message.uri,
                        shortname: message.shortName,
                        token: message.token,
                        apiRoot: message.apiRoot,
                    });
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    const { visId, uri, shortname, route, token, apiRoot } = viewData;

    console.log(shortname)
    if (!shortname) {
        return <div>WAITING</div>;
    } else {
   //     return <div>WTF</div>
        return <NovemViewPlot viewData={viewData} />;
    }
};

export default App;
