import React from 'react';
import { useContext } from 'react';
import { useTheme, ViewDataContext } from '../App'; // Adjust the import path accordingly

const NovemPlotView: React.FC = () => {
    //const { theme, colors } = useTheme();
    const { visId, uri, shortname } = useContext(ViewDataContext);

    console.log(visId, uri, shortname);
    console.log('HELLO PLOTS');
    //console.log(theme)
    // Just as an example, let's say you want to set the background and foreground colors from the theme.
    // You can use inline styles, or better yet, apply classNames based on the theme and define these styles in CSS.

    return <div>Hello from Novem Plot View for {visId}!</div>;
};

export default NovemPlotView;
