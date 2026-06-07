import React from 'react';

import './NovemVisChrome.css';

import { FetchedData } from '../types';
import { VisThemeMode } from '../ns';
import { avatarStyle } from '../utils';

// Inline, self-contained SVG icons (feather-style) — no CDN/codicon font, so
// everything ships in the addin bundle. They inherit colour via currentColor.

const SunIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
        />
    </svg>
);

const MoonIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

const SystemIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path strokeLinecap="round" d="M8 21h8M12 17v4" />
    </svg>
);

const RefreshIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
        />
    </svg>
);

// 3-way theme toggle, ordered light → system → dark (matches gaia/webapp).
const THEME_MODES: { mode: VisThemeMode; Icon: () => React.ReactElement; label: string }[] = [
    { mode: 'light', Icon: SunIcon, label: 'Light theme' },
    { mode: 'system', Icon: SystemIcon, label: 'System theme' },
    { mode: 'dark', Icon: MoonIcon, label: 'Dark theme' },
];

interface ChromeProps {
    fetchedData: FetchedData;
    /** Optional title override (mails prefer their subject). */
    title?: string;
    mode: VisThemeMode;
    onSetMode: (mode: VisThemeMode) => void;
    onRefresh: () => void;
}

const NovemVisChrome = (props: ChromeProps) => {
    const { fetchedData, title, mode, onSetMode, onRefresh } = props;

    const visName = title || fetchedData.about?.name || 'Untitled';
    const authorName = fetchedData.creator?.name ?? '';
    const authorUsername = fetchedData.creator?.username ?? '';
    const avatarUrl = fetchedData.creator?.avatar;

    const activeIndex = THEME_MODES.findIndex(m => m.mode === mode);

    return (
        <header className="nv-chrome">
            <div className="nv-chrome__avatar" style={avatarStyle(avatarUrl)} />
            <div className="nv-chrome__meta">
                <div className="nv-chrome__title" title={visName}>
                    {visName}
                </div>
                <div className="nv-chrome__author">
                    {authorName}
                    {authorUsername && (
                        <span className="nv-chrome__username"> ({authorUsername})</span>
                    )}
                </div>
            </div>
            <div className="nv-chrome__actions">
                <div className="nv-theme" role="radiogroup" aria-label="Theme">
                    <span
                        className="nv-theme__thumb"
                        style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
                    />
                    {THEME_MODES.map(({ mode: m, Icon, label }) => (
                        <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={mode === m}
                            className={`nv-theme__seg${mode === m ? ' nv-theme__seg--active' : ''}`}
                            onClick={() => onSetMode(m)}
                            title={label}
                            aria-label={label}
                        >
                            <Icon />
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="nv-chrome__btn"
                    onClick={onRefresh}
                    title="Refresh"
                    aria-label="Refresh"
                >
                    <RefreshIcon />
                </button>
            </div>
        </header>
    );
};

export default NovemVisChrome;
