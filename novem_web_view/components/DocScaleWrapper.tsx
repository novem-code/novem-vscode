import React, { useRef, useEffect, useState, type ReactNode } from 'react';

/**
 * Widest page across all doc formats — 16:9 pres slides at 1280px (wider than
 * landscape A4's 1122px). The inner div is FIXED at this width plus gutter
 * slack: ns.js derives its own docScale from the inner div's clientWidth, so
 * feeding the measured content width back into it couples two scalers, and
 * any few-pixel shave (scrollbar gutter, panel border) then ratchets the doc
 * smaller on every pass. The slack keeps ns.js laying out at full size
 * (docScale exactly 1) even after a gutter reservation.
 */
const MAX_PAGE_WIDTH = 1280;
const INNER_WIDTH = MAX_PAGE_WIDTH + 32;

interface DocScaleWrapperProps {
    children: ReactNode;
}

/**
 * Renders children at full natural size, then scales the whole output to fit
 * the container width: pages stacked, scrolling vertically. Landscape pages
 * fill the width; portrait pages come out proportionally narrower.
 */
export default function DocScaleWrapper({ children }: DocScaleWrapperProps) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [leftOffset, setLeftOffset] = useState(0);
    const [wrapperHeight, setWrapperHeight] = useState<number | undefined>(undefined);

    const measure = () => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;

        const availableWidth = outer.clientWidth;

        // A zero width is the ABSENCE of a layout, not a layout to scale to:
        // it reads that way before first paint, while an ancestor is
        // display:none (a backgrounded panel), and transiently while the
        // browser re-lays-out on an editor zoom change. Committing it sets
        // scale(0) — the doc goes invisible inside a box that keeps its
        // height — and it only returns if some later mutation happens to fire
        // another measure. Keep the last good scale AND height: a stale
        // height is invisible while the box has no width, and the next real
        // measurement replaces both.
        if (!(availableWidth > 0)) return;

        // Widest rendered page = content width (only the scale factor uses
        // it — never the inner div's width; see INNER_WIDTH above).
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

        setScale(newScale);
        // Pages center in the inner div (margin: auto), so center the inner;
        // a negative offset clips only its empty side margins, symmetrically.
        setLeftOffset((availableWidth - INNER_WIDTH * newScale) / 2);
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
                    width: `${INNER_WIDTH}px`,
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
