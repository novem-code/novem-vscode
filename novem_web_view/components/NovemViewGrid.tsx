import React from 'react';

import { NovemLoading } from '.';
import NovemVisView from './NovemVisView';

import { FetchedData, ViewData } from '../types';

const NovemViewGrid = (props: {
    fetchedData?: FetchedData;
    viewData: ViewData;
    refreshKey: number;
    onRefresh: () => void;
}) => {
    const { fetchedData, viewData, refreshKey, onRefresh } = props;

    if (!fetchedData) return <NovemLoading />;

    return (
        <NovemVisView
            type="g"
            variant="flow"
            fetchedData={fetchedData}
            viewData={viewData}
            refreshKey={refreshKey}
            onRefresh={onRefresh}
        />
    );
};

export default NovemViewGrid;
