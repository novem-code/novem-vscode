import React from 'react';

import { NovemLoading } from '.';
import NovemVisView from './NovemVisView';

import { FetchedData, ViewData } from '../types';

const NovemViewGrid = (props: { fetchedData?: FetchedData; viewData: ViewData }) => {
    const { fetchedData, viewData } = props;

    if (!fetchedData) return <NovemLoading />;

    return <NovemVisView type="g" variant="flow" fetchedData={fetchedData} viewData={viewData} />;
};

export default NovemViewGrid;
