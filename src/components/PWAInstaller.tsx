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

        // Listen for BeforeInstallPrompt (Chrome/Android/Desktop)
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            if (!isStandaloneMode) {
                setShowPrompt(true);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Show prompt for iOS if not standalone
        if (isIOSDevice && !isStandaloneMode) {
            // Only show if not shown recently
            const lastShown = localStorage.getItem('pwa_prompt_last_shown');
            const now = Date.now();
            if (!lastShown || now - parseInt(lastShown) > 24 * 60 * 60 * 1000) {
                setShowPrompt(true);
            }
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
                        <div className="flex items-center gap-3 text-[12px] font-bold">
                            <span className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center text-[10px] text-white">1</span>
                            <span>点击浏览器底部的“分享”按钮</span>
                            <div className="p-1 px-2 rounded-lg bg-white/10 text-blue-400">
                                <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-[12px] font-bold">
                            <span className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center text-[10px] text-white">2</span>
                            <span>在菜单中找到并选择“添加到主屏幕”</span>
                            <div className="p-1 px-2 rounded-lg bg-white/10">
                                <svg className="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
