import React, { useEffect } from 'react';

import { NovemLoading } from '.';

import { FetchedData, ViewData } from '../types';
import { enforceStyles } from '../utils';

// NS LIBRARY INTEGRATIONS
interface NSFunctions {
    setup: (config: { bearerToken?: string; apiUrl?: string; assetUrl?: string }) => void;
    register: (a: string, b: string, targetId: string) => void;
}

declare global {
    interface Window {
        ns?: NSFunctions;
    }
}

const NovemPlotRender = (props: { viewData: ViewData }) => {
    const { visId, uri, shortname, token, apiRoot } = props.viewData;

    useEffect(() => {
        if (!shortname) return;

        // Check if the function exists on the window object before calling it
        if (window.ns?.setup && shortname && token) {
            let apiUrl = new URL(apiRoot).origin;
            let assetUrl = apiUrl.replace('://api.', '://');

            window.ns.setup({
                bearerToken: token,
                apiUrl: apiUrl,
                assetUrl: assetUrl,
            });

            window.ns.register('p', shortname, `novem--vis--target`);

            enforceStyles();
        }
    }, []);

    return <div className="novem--vis--innerhold" id={`novem--vis--target`}></div>;
};

const NovemPlotProfile = (props: { fetchedData: FetchedData }) => {
    const { fetchedData } = props;

    const visualizationName = fetchedData.about?.name ?? 'Your placeholder chart';
    const authorName = fetchedData.creator?.name ?? 'Novem Placeholder';
    const authorUsername = fetchedData.creator?.username ?? 'novem_placeholder';
    const avatarUrl = fetchedData.creator?.avatar;

    return (
        <div className="novem--vis--profile">
            <div className="img" style={{ backgroundImage: `url(${avatarUrl}&s=160)` }}></div>
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

const NovemViewPlot = (props: { fetchedData?: FetchedData; viewData: ViewData }) => {
    const { fetchedData, viewData } = props;

    if (!fetchedData) return <NovemLoading />;

    return (
        <div className="novem--vis--hold">
            <div className="novem--vis--plot">
                <NovemPlotRender viewData={viewData} />
            </div>
            <NovemPlotProfile fetchedData={fetchedData} />
        </div>
    );
};

export default NovemViewPlot;
