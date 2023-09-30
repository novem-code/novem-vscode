import React, { useEffect, useContext } from 'react';

import { ViewDataContext, FetchedDataContext } from '../App'; // Adjust the import path accordingly

// NS LIBRARY INTEGRATIONS
interface NSFunctions {
    setup: (config: {
        bearerToken: string;
        apiUrl: string;
        assetUrl: string;
    }) => void;
    register: (a: string, b: string, targetId: string) => void;
}

declare global {
    interface Window {
        ns?: NSFunctions;
    }
}

const NovemPlotRender: React.FC = () => {
    const { visId, uri, shortname, token, apiRoot } =
        useContext(ViewDataContext);

    useEffect(() => {
        if (!shortname) return;

        // Check if the function exists on the window object before calling it
        if (window.ns?.setup && shortname && token) {
            window.ns.setup({
                bearerToken: token,
                apiUrl: 'https://api.novem.no',
                assetUrl: 'https://novem.no',
            });

            window.ns.register('p', shortname, `novem--vis--target`);
        }
    }, []); // Added dependencies to useEffect

    return (
        <div className="novem--vis--innerhold" id={`novem--vis--target`}></div>
    );
};

const MemoizedNovemPlotRender = React.memo(NovemPlotRender);

const NovemPlotProfile: React.FC = () => {
    const fetchedData = useContext(FetchedDataContext);

    // Destructure the relevant fields from the fetched data
    const visualizationName = fetchedData?.about?.name;
    const authorName = fetchedData?.creator?.name;
    const authorUsername = fetchedData?.creator?.username;
    const avatarUrl = fetchedData?.creator?.avatar;

    return (
        <div className="novem--vis--profile">
            <div
                className="img"
                style={{ backgroundImage: `url(${avatarUrl})` }}
            ></div>
            <div className="details">
                <div className="name">{visualizationName}</div>
                <div className="author">
                    {authorName}
                    <span className="username"> @{authorUsername}</span>
                </div>
            </div>
        </div>
    );
};

const NovemViewPlot: React.FC = () => {
    return (
        <div className="novem--vis--hold">
            <div className="novem--vis--plot">
                <MemoizedNovemPlotRender />
            </div>
            <NovemPlotProfile />
        </div>
    );
};

export default NovemViewPlot;
