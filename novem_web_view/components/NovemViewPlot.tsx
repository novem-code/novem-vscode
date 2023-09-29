import { useContext } from 'react';
import React, { useEffect } from 'react';
import { useTheme, ViewDataContext } from '../App'; // Adjust the import path accordingly

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

const NovemPlotProfile: React.FC = () => {
    //const { theme, colors } = useTheme();
    const { shortname, token, apiRoot } = useContext(ViewDataContext);

    return (
        <div className="novem--vis--profile">
            <div className="img"></div>
            <div className="details">
                <div className="name">Top US states by population and age</div>
                <div className="author">
                    Novem Demo User
                    <span className="username"> @novem_demo</span>
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

    // fetch plot info, use this to render

    console.log(visId, uri, shortname, token, apiRoot);

    console.log('THEME:', theme);

    return (
        <div
            className="novem--vis--hold"
            {...(theme === 'dark' ? { 'data-dark-mode': true } : {})}
        >
            <NovemPlot />
            <NovemPlotProfile />
        </div>
    );
};

export default NovemViewPlot;
