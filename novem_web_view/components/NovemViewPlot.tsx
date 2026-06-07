import React from 'react';

import { NovemLoading } from '.';
import NovemVisView from './NovemVisView';

import { FetchedData, ViewData } from '../types';

const NovemViewPlot = (props: {
    fetchedData?: FetchedData;
    viewData: ViewData;
    refreshKey: number;
    onRefresh: () => void;
}) => {
    const { fetchedData, viewData, refreshKey, onRefresh } = props;

    if (!fetchedData) return <NovemLoading />;

    return (
        <NovemVisView
            type="p"
            variant="fill"
            fetchedData={fetchedData}
            viewData={viewData}
            refreshKey={refreshKey}
            onRefresh={onRefresh}
        />
    );
};

export default NovemViewPlot;
