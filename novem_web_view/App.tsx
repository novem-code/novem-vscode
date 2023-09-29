import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    BrowserRouter as Router,
    Route,
    Routes,
    useNavigate,
} from 'react-router-dom';
import NovemViewPlot from './components/NovemViewPlot';
import NovemViewMail from './components/NovemViewMail';
import NovemViewProfile from './components/NovemViewProfile';

// Step 1: Create a ThemeContext
const ThemeContext = createContext<{
    theme?: 'light' | 'dark' | 'highContrast';
    colors?: {
        foreground?: string;
        background?: string;
        // ... other color definitions
    };
}>({});

export const useTheme = () => useContext(ThemeContext);

export const ViewDataContext = createContext<{
    visId?: string;
    uri?: string;
    shortname?: string;
    route?: string;
    token?: string;
    apiRoot?: string;
}>({});

const MainContent = () => {
  //  const [theme, setTheme] = useState<'light' | 'dark' | 'highContrast'>();
    const navigate = useNavigate();
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
                    {
                        setViewData({
                            route: message.route,
                            visId: message.visId,
                            uri: message.uri,
                            shortname: message.shortName,
                            token: message.token,
                            apiRoot: message.apiRoot,
                        });
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    useEffect(() => {
        if (viewData.route) {
            navigate(viewData.route);
        }
    }, [navigate, viewData.route]);

    
    return (
        <ViewDataContext.Provider value={viewData}>
            <Routes>
                <Route path="/plot" element={<NovemViewPlot />} />
                <Route path="/mail" element={<NovemViewMail />} />
                <Route path="/profile" element={<NovemViewProfile />} />
                <Route
                    path="/"
                    element={<NovemViewPlot />}
                />
            </Routes>
        </ViewDataContext.Provider>
    );
};

// Before creating the ThemeProvider, define its props:
interface ThemeProviderProps {
    children: React.ReactNode;
}

// Step 2: Create ThemeProvider
const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [theme, setTheme] = useState<'light' | 'dark' | 'highContrast'>();
    const [colors, setColors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        window.addEventListener('message', (event) => {});
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.command) {
                case 'setTheme':
                    setTheme(message.theme);
                    //setColors(message.colors);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, colors }}>
            {children}
        </ThemeContext.Provider>
    );
};

const App = () => {
    return (
        <Router>
            <ThemeProvider>
                <MainContent />
            </ThemeProvider>
        </Router>
    );
};

export default App;
