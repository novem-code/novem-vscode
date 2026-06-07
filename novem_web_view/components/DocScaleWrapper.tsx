import React, { useRef, useEffect, useState, type ReactNode } from 'react';

/**
 * Maximum possible page width across all doc formats — 16:9 pres slides are
 * 1280px wide (wider than landscape A4's 1122px). The inner div starts at
 * this width so the renderer has room to lay out the widest page at full
 * size without internal scaling; the actual widest wrapper is measured after
 * render and the inner div resized to match.
 */
const MAX_PAGE_WIDTH = 1280;

interface DocScaleWrapperProps {
    children: ReactNode;
}

/**
 * Renders children at full natural size (wide enough for any page orientation),
 * then scales the entire output to fit the available container width. Ported
 * from gaia/webapp so doc previews match the webapp's embedded/thread view: all
 * pages stacked, scaled to the panel width, scrolling vertically.
 *
 * After ns.js renders, the actual widest page wrapper is measured to determine
 * the effective content width. The inner div is then resized to match, so pages
 * sit flush-left inside it and all centering is handled by leftOffset.
 */
export default function DocScaleWrapper({ children }: DocScaleWrapperProps) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [leftOffset, setLeftOffset] = useState(0);
    const [innerWidth, setInnerWidth] = useState(MAX_PAGE_WIDTH);
    const [wrapperHeight, setWrapperHeight] = useState<number | undefined>(undefined);

    const measure = () => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;

        const availableWidth = outer.clientWidth;

        // After ns.js renders, find the widest page wrapper to determine
        // the actual content width. Falls back to MAX_PAGE_WIDTH before render.
        let contentWidth = MAX_PAGE_WIDTH;
        const wrappers = inner.querySelectorAll('.novem--doc--page-wrapper');
        if (wrappers.length > 0) {
            let maxW = 0;
            wrappers.forEach(w => {
                const el = w as HTMLElement;
                maxW = Math.max(maxW, el.offsetWidth);
            });
            if (maxW > 0) contentWidth = maxW;
        }

        const newScale = Math.min(availableWidth / contentWidth, 1);
        const scaledWidth = contentWidth * newScale;

        setScale(newScale);
        setInnerWidth(contentWidth);
        setLeftOffset(Math.max(0, (availableWidth - scaledWidth) / 2));
        setWrapperHeight(inner.scrollHeight * newScale);
    };

    // ResizeObserver for container width changes
    useEffect(() => {
        const outer = outerRef.current;
        if (!outer) return;

        const ro = new ResizeObserver(() => measure());
        ro.observe(outer);

        return () => ro.disconnect();
    }, []);

    // MutationObserver for ns.js content changes (async rendering)
    useEffect(() => {
        const inner = innerRef.current;
        if (!inner) return;

        const mo = new MutationObserver(() => measure());
        mo.observe(inner, { childList: true, subtree: true, attributes: true });

        // Initial measurement
        measure();

        return () => mo.disconnect();
    }, []);

    return (
        <div
            ref={outerRef}
            style={{
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                height: wrapperHeight !== undefined ? `${wrapperHeight}px` : 'auto',
                minHeight: '200px',
            }}
        >
            <div
                ref={innerRef}
                style={{
                    width: `${innerWidth}px`,
                    position: 'absolute',
                    top: 0,
                    left: `${leftOffset}px`,
                    transformOrigin: 'top left',
                    transform: `scale(${scale})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}
