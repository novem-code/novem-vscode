import React from 'react';

import { NovemLoading } from '.';
import DocScaleWrapper from './DocScaleWrapper';
import './NovemViewVis.css';

import { FetchedData, ViewData } from '../types';
import { useNsRegistration } from '../ns';
import { avatarStyle } from '../utils';

const NovemDocRender = (props: { viewData: ViewData }) => {
    // Docs render their own theme from config — useNsRegistration deliberately
    // skips the ns-config-theme hint for type 'd'.
    useNsRegistration('d', props.viewData, 'novem--vis--target');

    return <div className="novem--vis--innerhold" id={`novem--vis--target`}></div>;
};

const NovemDocProfile = (props: { fetchedData: FetchedData }) => {
    const { fetchedData } = props;

    const visualizationName = fetchedData.about?.name ?? 'Untitled document';
    const authorName = fetchedData.creator?.name ?? 'Novem Placeholder';
    const authorUsername = fetchedData.creator?.username ?? 'novem_placeholder';
    const avatarUrl = fetchedData.creator?.avatar;

    return (
        <div className="novem--vis--profile">
            <div className="img" style={avatarStyle(avatarUrl)}></div>
            <div className="details">
                <div className="name">{visualizationName}</div>
                <div className="author">
                    {authorName}
                    <span className="username"> @{authorUsername}</span>
                </div>
            </div>
        </div>
    );
};

const NovemViewDoc = (props: { fetchedData?: FetchedData; viewData: ViewData }) => {
    const { fetchedData, viewData } = props;

    if (!fetchedData) return <NovemLoading />;

    return (
        <div className="novem--vis--hold novem--vis--hold--doc">
            <div className="novem--vis--scroll novem--vis--doc">
                <DocScaleWrapper>
                    <NovemDocRender viewData={viewData} />
                </DocScaleWrapper>
            </div>
            <NovemDocProfile fetchedData={fetchedData} />
        </div>
    );
};

export default NovemViewDoc;
