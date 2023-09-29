import React, { useEffect, createContext, useContext, useState } from 'react';
import { useTheme, ViewDataContext } from '../App'; // Adjust the import path accordingly

interface Creator {
    username: string;
    name: string;
    avatar: string;
}

interface About {
    shortname: string;
    name: string;
    created: string;
    uri_vis: string;
    uri_img: string;
    uri_pdf: string;
    vis_type: string;
    description: string;
    summary: string;
}

interface FetchedData {
    data: any[];
    metadata: Record<string, unknown>;
    config: Record<string, unknown>;
    creator: Creator;
    references: any;
    recipients: any;
    about: About;
}

const FetchedDataContext = createContext<FetchedData | null>(null);

interface NSFunctions {
    setup: (config: {
        bearerToken: string;
        apiUrl: string;
        assetUrl: string;
    }) => void;
    register: (a: string, b: string, targetId: string) => void;
}

// Extend the window object to recognize the `ns` property
declare global {
    interface Window {
        ns?: NSFunctions;
    }
}

const NovemPlotProfileImage: React.FC = () => {
    // Accessing the fetched data from the global state
    const fetchedData = useContext(FetchedDataContext);

    // Destructure the avatar URL from the fetched data
    const avatarUrl = fetchedData?.creator?.avatar;

    return (
        <div
            className="img"
            style={{ backgroundImage: `url(${avatarUrl})` }}
        ></div>
    );
};

const NovemPlotProfile: React.FC = () => {
    // Accessing the fetched data from the global state
    const fetchedData = useContext(FetchedDataContext);

    // Destructure the relevant fields from the fetched data
    const visualizationName = fetchedData?.about?.name;
    const authorName = fetchedData?.creator?.name;
    const authorUsername = fetchedData?.creator?.username;

    return (
        <div className="novem--vis--profile">
            <NovemPlotProfileImage />
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

const NovemPlot: React.FC = () => {
    //const { theme, colors } = useTheme();
    const { visId, uri, shortname, token } = useContext(ViewDataContext);

    useEffect(() => {
        // Check if the function exists on the window object before calling it
        if (window.ns?.setup && shortname && token) {
            window.ns.setup({
                bearerToken: token,
                apiUrl: 'https://api.novem.no',
                assetUrl: 'https://novem.no',
            });
            window.ns.register('p', shortname, 'novem--vis--target');
        }
    }, []);

    return (
        <div className="novem--vis--plot">
            <div
                className="novem--vis--innerhold"
                id="novem--vis--target"
            ></div>
        </div>
    );
};

const NovemViewPlot: React.FC = () => {
    const { theme, colors } = useTheme();
    const { visId, uri, shortname, token, apiRoot } =
        useContext(ViewDataContext);

    const [fetchedData, setFetchedData] = useState<FetchedData | null>(null);

    useEffect(() => {
        if (token && apiRoot && shortname) {
            fetch(`${apiRoot}i/${shortname}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
                .then((response) => response.json())
                .then((data) => {
                    setFetchedData(data);
                    console.log(data);
                })
                .catch((error) => {
                    console.error('Error fetching data:', error);
                });
        }
    }, [token, apiRoot, shortname]);

    return (
        <FetchedDataContext.Provider value={fetchedData}>
            <div
                className="novem--vis--hold"
                {...(theme === 'dark' ? { 'data-dark-mode': true } : {})}
            >
                <NovemPlot />
                <NovemPlotProfile />
            </div>
        </FetchedDataContext.Provider>
    );
};

export default NovemViewPlot;
