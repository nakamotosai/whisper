'use client';

import React, { useEffect, useState, useRef } from 'react';

export const IdleDimmer = () => {
    const [isIdle, setIsIdle] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

        const resetTimer = () => {
            if (isIdle) setIsIdle(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setIsIdle(true);
            }, 30000); // 30 seconds
        };

        // Initialize timer
        resetTimer();

        // Add event listeners
        events.forEach(event => {
            window.addEventListener(event, resetTimer, { passive: true });
        });

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [isIdle]);

    if (!isIdle) return null;

    return (
        <div
            className="fixed inset-0 z-[99999] bg-black/80 pointer-events-none transition-opacity duration-1000 animate-in fade-in"
            style={{ backdropFilter: 'blur(2px)' }}
        >
            <div className="absolute top-10 left-1/2 -translate-x-1/2 text-white/20 text-xs tracking-[0.5em] font-light uppercase select-none">
                Power Saving Mode
            </div>
        </div>
    );
};
