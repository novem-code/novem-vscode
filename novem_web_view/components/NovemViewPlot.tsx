import React, {
    useEffect,
    createContext,
    useContext,
    useState,
    useRef,
} from 'react';

import { select } from 'd3-selection';

function generateRandomIdString(length = 8) {
    const characters =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * characters.length),
        );
    }
    return result;
}

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

// Define the props type
interface PlotProfile {
    plotName?: string;
    authorName?: string;
    authorImg?: string;
    authorUserName?: string;
}

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

// Define the props type
interface NovemPlotRenderProps {
    visId?: string;
    uri?: string;
    shortname?: string;
    token?: string;
}

const NovemPlotRender: React.FC<NovemPlotRenderProps> = ({
    visId,
    uri,
    shortname,
    token,
}) => {
    const randomId = generateRandomIdString();

    const myRef = useRef(null);

    useEffect(() => {
        if (!shortname) return;

        if (select('body').classed('vscode-dark')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }

        // Check if the function exists on the window object before calling it
        if (window.ns?.setup && shortname && token) {
            window.ns.setup({
                bearerToken: token,
                apiUrl: 'https://api.novem.no',
                assetUrl: 'https://novem.no',
            });

            window.ns.register(
                'p',
                shortname,
                `novem--vis--target-${randomId}`,
            );

            // let's add some headers

            // figure out if we are in darkmode
            console.log(select('body').attr('class'));

            if (select('body').classed('vscode-dark')) {
                console.log('Make it darkmode');
                const iframes = document.getElementsByTagName('iframe');
                for (const iframe of iframes) {
                    let cd = iframe.contentDocument;
                    try {
                        cd?.documentElement.setAttribute('data-dark-mode', '');
                    } catch (e) {}
                }
            } else {
                console.log('Make it lightmode');
                // iterate over iframes and tag them
                const iframes = document.getElementsByTagName('iframe');
                for (const iframe of iframes) {
                    let cd = iframe.contentDocument;
                    try {
                        cd?.documentElement.removeAttribute('data-dark-mode');
                    } catch (e) {}
                }
            }
        }
    }, []); // Added dependencies to useEffect

    return (
        <div
            className="novem--vis--innerhold"
            id={`novem--vis--target-${randomId}`}
            ref={myRef}
        ></div>
    );
};

const MemoizedNovemPlotRender = React.memo(NovemPlotRender);

type NovemPlotProps = {
    viewData: ViewData;
};

const NovemPlot: React.FC<NovemPlotProps> = ({ viewData }) => {
    const { visId, uri, shortname, token } = viewData;

    if (!shortname) {
        return <div className="novem--vis--plot">Waiting for data...</div>;
    }

    return (
        <div className="novem--vis--plot">
            <MemoizedNovemPlotRender
                visId={visId}
                uri={uri}
                shortname={shortname}
                token={token}
            />
        </div>
    );
};

type NovemPlotProfileProps = {
    visualizationName: string | undefined;
    authorName: string | undefined;
    authorUsername: string | undefined;
    avatarUrl: string | undefined;
};

const NovemPlotProfile: React.FC<NovemPlotProfileProps> = ({
    visualizationName,
    authorName,
    authorUsername,
    avatarUrl,
}) => {
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

type ViewData = {
    visId?: string;
    uri?: string;
    shortname?: string;
    route?: string;
    token?: string;
    apiRoot?: string;
};

type NovemWrapperProps = {
    fetchedData: FetchedData | null;
    viewData: ViewData;
};

const NovemWrapper: React.FC<NovemWrapperProps> = ({
    fetchedData,
    viewData,
}) => {
    const { visId, uri, shortname, token } = viewData;

    // Destructure the relevant fields from the fetched data
    const visualizationName = fetchedData?.about?.name;
    const authorName = fetchedData?.creator?.name;
    const authorUsername = fetchedData?.creator?.username;
    const avatarUrl = fetchedData?.creator?.avatar;

    // we're going to a rules based world here
    if (!authorUsername) {
        return <div className="novem--vis--hold">LOADING BABY</div>;
    }

    return (
        <div className="novem--vis--hold">
            <NovemPlot viewData={viewData} />
            <NovemPlotProfile
                visualizationName={visualizationName}
                authorName={authorName}
                authorUsername={authorUsername}
                avatarUrl={avatarUrl}
            />
        </div>
    );
};

type NovemViewPlotProps = {
    viewData: ViewData;
};

const NovemViewPlot: React.FC<NovemViewPlotProps> = ({ viewData }) => {
    const { visId, uri, shortname, route, token, apiRoot } = viewData;

    const [fetchedData, setFetchedData] = useState<FetchedData | null>(null);

    useEffect(() => {
        if (!shortname) return;

        fetch(`${apiRoot}i/${shortname}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
            .then((response) => response.json())
            .then((data) => {
                setFetchedData(data);
            })
            .catch((error) => {
                console.error('Error fetching data:', error);
            });
    }, [token, apiRoot, shortname]);

    return <NovemWrapper fetchedData={fetchedData} viewData={viewData} />;
};

export default NovemViewPlot;
