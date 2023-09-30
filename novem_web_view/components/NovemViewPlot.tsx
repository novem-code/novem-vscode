import React, { useEffect, useContext } from 'react';
import { ViewDataContext, FetchedDataContext, enforceStyles } from '../App'; // Adjust the import path accordingly

// NS LIBRARY INTEGRATIONS
interface NSFunctions {
    setup: (config: {
        bearerToken?: string;
        apiUrl?: string;
        assetUrl?: string;
        ignoreSSLWarninig?: boolean;
    }) => void;
    register: (a: string, b: string, targetId: string) => void;
}

declare global {
    interface Window {
        ns?: NSFunctions;
    }
}

const NovemPlotRender: React.FC = () => {
    const { visId, uri, shortname, token, apiRoot, ignoreSslWarn } =
        useContext(ViewDataContext);

    useEffect(() => {
        if (!shortname) return;

        // Check if the function exists on the window object before calling it
        if (window.ns?.setup && shortname && token) {
            let apiUrl = 'https://api.novem.no';
            let assetUrl = 'https://novem.no';

            if (ignoreSslWarn) {
                apiUrl = 'http://dev.api.novem.no';
                assetUrl = 'http://dev.novem.no';
            }

            window.ns.setup({
                bearerToken: token,
                apiUrl: apiUrl,
                assetUrl: assetUrl,
            });

            window.ns.register('p', shortname, `novem--vis--target`);

            enforceStyles();
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
    const visualizationName =
        fetchedData?.about?.name ?? 'Your placeholder chart';
    const authorName = fetchedData?.creator?.name ?? 'Novem Placeholder';
    const authorUsername =
        fetchedData?.creator?.username ?? 'novem_placeholder';
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
