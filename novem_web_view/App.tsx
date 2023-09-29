import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    BrowserRouter as Router,
    Route,
    Routes,
    useNavigate,
} from 'react-router-dom';
import NovemPlotView from './components/NovemPlotView';
import NovemMailView from './components/NovemMailView';
import NovemProfileView from './components/NovemProfileView';

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
}>({});

const MainContent = () => {
    const navigate = useNavigate();
    const [viewData, setViewData] = useState({
        visId: undefined,
        uri: undefined,
        shortname: undefined,
    });

    useEffect(() => {
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'navigate':
                    navigate(message.route);
                    setViewData({
                        visId: message.visId,
                        uri: message.uri,
                        shortname: message.shortname,
                    });
                    break;
            }
        });
    }, [navigate]);

    return (
        <ViewDataContext.Provider value={viewData}>
            <Routes>
                <Route path="/plot" element={<NovemPlotView />} />
                <Route path="/mail" element={<NovemMailView />} />
                <Route path="/profile" element={<NovemProfileView />} />
                <Route
                    path="/"
                    element={<div>Hello World from Novem Web View!</div>}
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
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'setTheme':
                    setTheme(message.theme);
                    setColors(message.colors);
                    break;
            }
        });
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
