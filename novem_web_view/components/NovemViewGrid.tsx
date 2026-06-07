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

    // Grids must use 'fill' (definite container height), not 'flow'. vislib's
    // grid renderers are fixed-canvas, scale-to-fit: the dashboard grid sizes an
    // absolutely-positioned container to the target's clientHeight, and the
    // landscape grid scales by clientHeight. With 'flow' (height:auto) the
    // target's clientHeight collapses to ~0 and the grid disappears.
    return (
        <NovemVisView
            type="g"
            variant="fill"
            fetchedData={fetchedData}
            viewData={viewData}
            refreshKey={refreshKey}
            onRefresh={onRefresh}
        />
    );
};

export default NovemViewGrid;
