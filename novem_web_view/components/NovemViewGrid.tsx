import React from 'react';

import { NovemLoading } from '.';
import './NovemViewVis.css';

import { FetchedData, ViewData } from '../types';
import { useNsRegistration } from '../ns';
import { avatarStyle } from '../utils';

const NovemGridRender = (props: { viewData: ViewData }) => {
    useNsRegistration('g', props.viewData, 'novem--vis--target');

    return <div className="novem--vis--innerhold" id={`novem--vis--target`}></div>;
};

const NovemGridProfile = (props: { fetchedData: FetchedData }) => {
    const { fetchedData } = props;

    const visualizationName = fetchedData.about?.name ?? 'Untitled grid';
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

const NovemViewGrid = (props: { fetchedData?: FetchedData; viewData: ViewData }) => {
    const { fetchedData, viewData } = props;

    if (!fetchedData) return <NovemLoading />;

    return (
        <div className="novem--vis--hold">
            <div className="novem--vis--scroll novem--vis--grid">
                <NovemGridRender viewData={viewData} />
            </div>
            <NovemGridProfile fetchedData={fetchedData} />
        </div>
    );
};

export default NovemViewGrid;
