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
    const nsError = useNsRegistration(type, viewData, TARGET_ID, refreshKey);

    // Kept mounted (just hidden) while an error shows: a refresh clears the
    // error and re-registers into this same node, which must already exist by
    // the time the async register resolves.
    const target = <div className="nv-target" id={TARGET_ID} hidden={!!nsError} />;

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
                {nsError && (
                    <div className="nv-error" role="alert">
                        <p className="nv-error__title">Preview unavailable</p>
                        <p className="nv-error__detail">{nsError}</p>
                    </div>
                )}
                {scale ? <DocScaleWrapper>{target}</DocScaleWrapper> : target}
            </div>
        </div>
    );
};

export default NovemVisView;
