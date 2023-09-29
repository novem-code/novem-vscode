import React, { createContext, useContext, useEffect, useState } from 'react';

import { select } from 'd3-selection';
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
        // Define the callback for the observer

        // Define the callback for the observer
        const callback = (
            mutationsList: MutationRecord[],
            observer: MutationObserver,
        ) => {
            for (let mutation of mutationsList) {
                if (
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'class'
                ) {
                    if (select('body').classed('vscode-dark')) {
                        localStorage.setItem('theme', 'dark');
                    } else {
                        localStorage.setItem('theme', 'light');
                    }

                    if (select('body').classed('vscode-dark')) {
                        const iframes = document.getElementsByTagName('iframe');
                        for (const iframe of iframes) {
                            let cd = iframe.contentDocument;
                            try {
                                cd?.documentElement.setAttribute(
                                    'data-dark-mode',
                                    '',
                                );
                            } catch (e) {}
                        }
                    } else {
                        // iterate over iframes and tag them
                        const iframes = document.getElementsByTagName('iframe');
                        for (const iframe of iframes) {
                            let cd = iframe.contentDocument;
                            try {
                                cd?.documentElement.removeAttribute(
                                    'data-dark-mode',
                                );
                            } catch (e) {}
                        }
                    }
                }
            }
        };

        // Create an observer instance with the callback
        const observer = new MutationObserver(callback);

        // Start observing the body with the configured parameters
        observer.observe(document.body, { attributes: true });

        // Cleanup: disconnect the observer when the component is unmounted
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.command) {
                case 'navigate':
                    console.log('setting message');
                    console.log(message);
                    setViewData({
                        route: message.route,
                        visId: message.visId,
                        uri: message.uri,
                        shortname: message.shortName,
                        token: message.token,
                        apiRoot: message.apiRoot,
                    });
                    window.removeEventListener('message', handleMessage);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    const { visId, uri, shortname, route, token, apiRoot } = viewData;

    console.log(shortname);
    if (!shortname) {
        return <div>WAITING</div>;
    } else {
        //     return <div>WTF</div>
        return <NovemViewPlot viewData={viewData} />;
    }
};

export default App;
