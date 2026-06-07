import React, { useState } from 'react';

import NovemVisChrome from './NovemVisChrome';
import DocScaleWrapper from './DocScaleWrapper';

import { FetchedData, ViewData } from '../types';
import { NsType, VisThemeMode, nextThemeMode, useVisTheme, useNsRegistration } from '../ns';

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
}

const NovemVisView = (props: VisViewProps) => {
    const { type, variant, fetchedData, viewData, title, bodyClassName, scale } = props;

    const [mode, setMode] = useState<VisThemeMode>('system');
    const [refreshKey, setRefreshKey] = useState(0);

    // useVisTheme MUST be called before useNsRegistration: effects run in
    // declaration order, so data-dark-mode is applied before the (async)
    // register reads getAppliedTheme() for its ns-config-theme hint.
    useVisTheme(mode);
    useNsRegistration(type, viewData, TARGET_ID, refreshKey);

    const target = <div className="nv-target" id={TARGET_ID} />;

    return (
        <div className="nv-frame">
            <NovemVisChrome
                fetchedData={fetchedData}
                title={title}
                mode={mode}
                onCycleTheme={() => setMode(nextThemeMode(mode))}
                onRefresh={() => setRefreshKey(k => k + 1)}
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
