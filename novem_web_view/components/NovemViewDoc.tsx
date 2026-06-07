import React from 'react';

import { NovemLoading } from '.';
import NovemVisView from './NovemVisView';

import { FetchedData, ViewData } from '../types';

const NovemViewDoc = (props: { fetchedData?: FetchedData; viewData: ViewData }) => {
    const { fetchedData, viewData } = props;

    if (!fetchedData) return <NovemLoading />;

    // Docs render their page stack scaled to the panel width (scale) and flow +
    // scroll under the chrome. vislib reads a doc's own theme, so the theme hint
    // is intentionally skipped for type 'd' in useNsRegistration.
    return (
        <NovemVisView type="d" variant="flow" scale fetchedData={fetchedData} viewData={viewData} />
    );
};

export default NovemViewDoc;
