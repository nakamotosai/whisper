'use client';

import { useEffect, useRef } from 'react';

export default function VersionManager() {
    const initialVersion = useRef<string | null>(null);

    useEffect(() => {
        const checkVersion = async () => {
            try {
                const res = await fetch(`/version.json?t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    const currentVersion = data.version;

                    if (initialVersion.current === null) {
                        initialVersion.current = currentVersion;
                    } else if (initialVersion.current !== currentVersion) {
                        console.log('New version detected, reloading...');
                        window.location.reload();
                    }
                }
            } catch (error) {
                console.error('Failed to check version:', error);
            }
        };

        // Check immediately on mount
        checkVersion();

        // Poll every 60 seconds
        const interval = setInterval(checkVersion, 60000);
        return () => clearInterval(interval);
    }, []);

    return null;
}
