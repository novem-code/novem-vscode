import React from 'react';

import { NovemLoading } from '.';
import NovemVisView from './NovemVisView';

import { FetchedData, ViewData } from '../types';

const MAIL_SIZES = ['xs', 'small', 'medium', 'large'] as const;

const NovemViewMail = (props: {
    fetchedData?: FetchedData;
    viewData: ViewData;
    refreshKey: number;
    onRefresh: () => void;
}) => {
    const { fetchedData, viewData, refreshKey, onRefresh } = props;

    if (!fetchedData) return <NovemLoading />;

    const rawSize = String(fetchedData.config?.size ?? 'medium');
    const size = (MAIL_SIZES as readonly string[]).includes(rawSize) ? rawSize : 'medium';

    // Mails surface their subject as the title; fall back to the resource name.
    const subject = fetchedData.config?.subject as string | undefined;

    return (
        <NovemVisView
            type="m"
            variant="flow"
            fetchedData={fetchedData}
            viewData={viewData}
            title={subject || fetchedData.about?.name}
            bodyClassName={`nv-body--mail nv-mail--size-${size}`}
            refreshKey={refreshKey}
            onRefresh={onRefresh}
        />
    );
};

export default NovemViewMail;
