'use client';

import React, { useState, useEffect } from 'react';
import { ThemeType } from '@/types';

interface PWAInstallerProps {
    theme?: ThemeType;
}

export const PWAInstaller: React.FC<PWAInstallerProps> = ({ theme = 'dark' }) => {
    const [showPrompt, setShowPrompt] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if already in standalone mode
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone
            || document.referrer.includes('android-app://');

        setIsStandalone(isStandaloneMode);

        // iOS detection
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        const canShowPrompt = () => {
            if (isStandaloneMode) return false;
            const lastShown = localStorage.getItem('pwa_prompt_last_shown');
            if (!lastShown) return true;
            const now = Date.now();
            return now - parseInt(lastShown) > 24 * 60 * 60 * 1000;
        };

        // Listen for BeforeInstallPrompt (Chrome/Android/Desktop)
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            if (canShowPrompt()) {
                setShowPrompt(true);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Show prompt for iOS if not standalone and cooldown passed
        if (isIOSDevice && canShowPrompt()) {
            setShowPrompt(true);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setShowPrompt(false);
        }
        setDeferredPrompt(null);
    };

    const closePrompt = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa_prompt_last_shown', Date.now().toString());
    };

    if (!showPrompt || isStandalone) return null;

    return (
        <div className="fixed inset-x-4 bottom-24 z-[9999] flex justify-center animate-in slide-in-from-bottom-5 fade-in duration-700">
            <div className={`relative w-full max-w-[400px] p-5 rounded-[28px] backdrop-blur-3xl border shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-4 ${theme === 'light' ? 'bg-white/90 border-black/5 text-black' : 'bg-[#1a1a1a]/95 border-white/10 text-white'}`}>

                {/* Close Button */}
                <button onClick={closePrompt} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-black/5 hover:bg-black/10 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-2xl shrink-0 p-2 bubble-rainbow border border-white/10">
                        <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-sm font-black tracking-widest uppercase">添加 UTOPIA 到界面</h3>
                        <p className={`text-[11px] font-medium leading-relaxed opacity-60`}>
                            {isIOS ? '从桌面快速访问，享受沉浸式体验' : '安装应用，享受更流畅的匿名聊天'}
                        </p>
                    </div>
                </div>

                {isIOS ? (
                    <div className={`flex flex-col gap-3 p-3.5 rounded-2xl ${theme === 'light' ? 'bg-black/5' : 'bg-white/5'}`}>
                        <div className="flex items-center gap-3 text-[11px] font-bold">
                            <span className="w-5 h-5 shrink-0 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-[10px]">1</span>
                            <span>请确保是在 <span className="text-blue-500">Safari 浏览器</span> 中打开本站</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-bold">
                            <span className="w-5 h-5 shrink-0 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-[10px]">2</span>
                            <div className="flex items-center gap-1.5 flex-1">
                                <span>点击底部工具栏的</span>
                                <div className="p-1 rounded-md bg-white/20 flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M4 12V20C4 20.5523 4.44772 21 5 21H19C19.5523 21 20 20.5523 20 20V12" />
                                        <path d="M12 15V3M12 3L8 7M12 3L16 7" />
                                    </svg>
                                </div>
                                <span>“分享”按钮</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-bold">
                            <span className="w-5 h-5 shrink-0 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-[10px]">3</span>
                            <div className="flex items-center gap-1.5 flex-1">
                                <span>选择菜单中的</span>
                                <div className="p-1 rounded-md bg-white/20 flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <line x1="12" y1="8" x2="12" y2="16" />
                                        <line x1="8" y1="12" x2="16" y2="12" />
                                    </svg>
                                </div>
                                <span>“添加到主屏幕”</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={handleInstallClick}
                        className="w-full h-12 rounded-2xl bg-white text-black text-xs font-black tracking-[0.2em] uppercase transition-all active:scale-95 shadow-[0_10px_20px_rgba(255,255,255,0.1)] hover:bg-gray-100"
                    >
                        立即安装应用
                    </button>
                )}
            </div>
        </div>
    );
};
