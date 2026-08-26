import React, { useRef, useEffect, useState, type ReactNode } from 'react';

/**
 * Maximum possible page width across all doc formats — 16:9 pres slides are
 * 1280px wide (wider than landscape A4's 1122px). The inner div is FIXED at
 * this width (plus gutter slack) so the renderer always lays out the widest
 * page at full size without internal scaling.
 *
 * The inner width must never follow the measured content width: ns.js's doc
 * renderer derives its own docScale from the inner div's clientWidth, so
 * feeding the rendered wrapper width back into the inner div couples two
 * scalers. When anything shaves a few pixels off a round (a scrollbar
 * gutter, a panel border), the coupled loop ratchets the doc smaller on
 * every pass — the preview visibly zooms out and restarts over and over.
 * The slack keeps ns.js's containerWidth ≥ the widest page even after a
 * gutter reservation, so its docScale stays exactly 1.
 */
const MAX_PAGE_WIDTH = 1280;
const INNER_WIDTH = MAX_PAGE_WIDTH + 32;

interface DocScaleWrapperProps {
    children: ReactNode;
}

/**
 * Renders children at full natural size (wide enough for any page orientation),
 * then scales the entire output to fit the available container width: all
 * pages stacked, scaled to the panel width, scrolling vertically.
 *
 * After ns.js renders, the actual widest page wrapper is measured to determine
 * the effective content width — used only for the scale factor, never fed back
 * into the inner div's width (see INNER_WIDTH above for why that coupling is
 * forbidden).
 *
 * This means:
 *   - Landscape pages fill the container width
 *   - Portrait pages are proportionally narrower (correct relative sizing)
 *   - Portrait-only documents still fill the container (no wasted space)
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

        setScale(newScale);
        // Wrappers center themselves inside the fixed-width inner div
        // (margin: auto), so centering the inner centers the content. The
        // offset goes negative when the scaled inner exceeds the container —
        // that clips only the inner's empty side margins, symmetrically.
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
