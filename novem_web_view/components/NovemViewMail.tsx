import React, { useEffect, useContext } from 'react';
import { ViewDataContext, FetchedDataContext, enforceStyles } from '../App'; // Adjust the import path accordingly

import './NovemViewMail.css';

// NS LIBRARY INTEGRATIONS
interface NSFunctions {
    setup: (config: {
        bearerToken?: string;
        apiUrl?: string;
        assetUrl?: string;
        ignoreSSLWarninig?: boolean;
    }) => void;
    register: (a: string, b: string, targetId: string) => void;
}

declare global {
    interface Window {
        ns?: NSFunctions;
    }
}

const NovemMailRender: React.FC = () => {
    const { visId, uri, shortname, token, apiRoot, ignoreSslWarn } =
        useContext(ViewDataContext);

    useEffect(() => {
        if (!shortname) return;

        // Check if the function exists on the window object before calling it
        if (window.ns?.setup && shortname && token) {
            let apiUrl = 'https://api.novem.no';
            let assetUrl = 'https://novem.no';

            if (ignoreSslWarn) {
                apiUrl = 'http://dev.api.novem.no';
                assetUrl = 'http://dev.novem.no';
            }

            window.ns.setup({
                bearerToken: token,
                apiUrl: apiUrl,
                assetUrl: assetUrl,
            });

            window.ns.register('m', shortname, `novem--vis--target`);
            enforceStyles();
            /*
            setTimeout(() => {
                console.log('STYLE IT FUCKER')
                enforceStyles();
            }, 1000); */
        }
    }, []); // Added dependencies to useEffect

    return (
        <div className="novem--vis--innerhold" id={`novem--vis--target`}></div>
    );
};

const MemoizedNovemMailRender = React.memo(NovemMailRender);

function formatDate(input: string): string {
    // Parse the input date string into a Date object
    const date = new Date(input);

    // Get the day of the week
    const daysOfWeek: string[] = [
        'Sun',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
    ];
    const dayOfWeek: string = daysOfWeek[date.getUTCDay()];

    // Get the day of the month and format it with ordinal suffix
    const dayOfMonth: number = date.getUTCDate();
    let daySuffix: string = 'th';
    if (dayOfMonth === 1 || dayOfMonth === 21 || dayOfMonth === 31)
        daySuffix = 'st';
    else if (dayOfMonth === 2 || dayOfMonth === 22) daySuffix = 'nd';
    else if (dayOfMonth === 3 || dayOfMonth === 23) daySuffix = 'rd';

    // Get the month
    const months: string[] = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    const month: string = months[date.getUTCMonth()];

    // Get the year
    const year: number = date.getUTCFullYear();

    // Return the formatted date
    return `${dayOfWeek} ${dayOfMonth}${daySuffix} of ${month} ${year}`;
}

const NovemMailProfile: React.FC = () => {
    const fetchedData = useContext(FetchedDataContext);

    // Destructure the relevant fields from the fetched data
    const visualizationName =
        fetchedData?.about?.name ?? 'Your placeholder chart';
    const subject = (fetchedData?.config?.subject ??
        'Novem Mail Subject Placeholder') as string;
    const date = fetchedData?.about?.created ?? 'Your placeholder chart';

    const authorName =
        fetchedData?.creator?.name ?? 'Tue, 25 Apr 2023 10:02:07 UTC';
    const authorUsername =
        fetchedData?.creator?.username ?? 'novem_placeholder';
    const avatarUrl = fetchedData?.creator?.avatar;

    const pdate = formatDate(date);
    return (
        <div className="novem--vis--profile--mail">
            <div className="holder">
                <div
                    className="img"
                    style={{ backgroundImage: `url(${avatarUrl})` }}
                ></div>
                <div className="novem--vis--profile--mail--text--content">
                    <div className="novem--vis--profile--mail--text--content--top">
                        <div className="from">{authorName}</div>
                        <div className="date set-current-date">{pdate}</div>
                    </div>
                    <div className="subject">{subject}</div>
                    <div className="to">
                        <span className="addr_inst">To:</span>
                        <span className="rcpt">Sondov Engen</span>
                    </div>
                    <div className="cc">
                        <span className="addr_inst">Cc:</span>
                        <span className="rcpt">Sondov Engen</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const NovemViewMail: React.FC = () => {
    const fetchedData = useContext(FetchedDataContext);

    const size = fetchedData?.config?.size ?? 'small';

    return (
        <div className={`novem--vis--hold--mail novem--mail--size--${size}`}>
            <div className="novem--vis--mail"></div>
            <NovemMailProfile />
            <MemoizedNovemMailRender />
        </div>
    );
};

export default NovemViewMail;
