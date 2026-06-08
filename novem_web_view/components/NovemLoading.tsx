import React from 'react';

import './NovemLoading.css';

type Variant = 'fill' | 'flow';

/**
 * Branded loading skeleton shown until a vis's data resolves. It mirrors the
 * NovemVisView frame — sticky chrome header + body — so the real chrome and
 * content sub in over an identically-shaped placeholder with no layout jump.
 * The body centres the vendored novem loading animation.
 *
 * `variant` matches the eventual view's frame sizing: 'fill' (plot/grid — a
 * definite-height frame) or 'flow' (doc/mail — grows + scrolls).
 */
const NovemLoading = ({ variant = 'fill' }: { variant?: Variant }) => {
    return (
        <div className={`nv-frame nv-frame--${variant}`} aria-busy="true">
            <header className="nv-chrome">
                <div className="nv-skel-avatar nv-skel-block" />
                <div className="nv-skel-meta">
                    <div className="nv-skel-title nv-skel-block" />
                    <div className="nv-skel-sub nv-skel-block" />
                </div>
                <div className="nv-skel-actions">
                    <div className="nv-skel-chip nv-skel-block" />
                    <div className="nv-skel-btn nv-skel-block" />
                </div>
            </header>
            <div className={`nv-skel-body nv-skel-body--${variant}`}>
                <div className="nv-skel-content">
                    <div className="nv-skel-spinner" role="img" aria-label="Loading" />
                </div>
            </div>
        </div>
    );
};

export default NovemLoading;
