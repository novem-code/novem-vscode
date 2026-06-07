import React, { useState } from 'react';

import NovemVisChrome from './NovemVisChrome';
import DocScaleWrapper from './DocScaleWrapper';

import { FetchedData, ViewData } from '../types';
import { NsType, VisThemeMode, useVisTheme, useNsRegistration } from '../ns';

// One vis per webview panel, so a constant target id is fine.
const TARGET_ID = 'novem--vis--target';

type Variant = 'fill' | 'flow';

interface VisViewProps {
    type: NsType;
    /** 'fill' = single chart fills the panel (plot); 'flow' = grows + scrolls under the chrome (grid/doc/mail). */
    variant: Variant;
    fetchedData: FetchedData;
    viewData: ViewData;
    /** Title override (mails prefer their subject over the resource name). */
    title?: string;
    /** Extra body class — e.g. mail width sizing. */
    bodyClassName?: string;
    /** Wrap the target in DocScaleWrapper (docs scale their page stack to the panel). */
    scale?: boolean;
    /** Bumped by the chrome refresh button; re-registers the vis. */
    refreshKey: number;
    /** Refresh handler — owned by App so it can also re-fetch resource metadata. */
    onRefresh: () => void;
}

const NovemVisView = (props: VisViewProps) => {
    const {
        type,
        variant,
        fetchedData,
        viewData,
        title,
        bodyClassName,
        scale,
        refreshKey,
        onRefresh,
    } = props;

    const [mode, setMode] = useState<VisThemeMode>('system');

    // useVisTheme MUST be called before useNsRegistration: effects run in
    // declaration order, so data-dark-mode is applied before the (async)
    // register reads getAppliedTheme() for its ns-config-theme hint.
    useVisTheme(mode);
    useNsRegistration(type, viewData, TARGET_ID, refreshKey);

    const target = <div className="nv-target" id={TARGET_ID} />;

    return (
        <div className={`nv-frame nv-frame--${variant}`}>
            <NovemVisChrome
                fetchedData={fetchedData}
                title={title}
                mode={mode}
                onSetMode={setMode}
                onRefresh={onRefresh}
            />
            <div
                className={`nv-body nv-body--${variant}${bodyClassName ? ` ${bodyClassName}` : ''}`}
            >
                {scale ? <DocScaleWrapper>{target}</DocScaleWrapper> : target}
            </div>
        </div>
    );
};

export default NovemVisView;
