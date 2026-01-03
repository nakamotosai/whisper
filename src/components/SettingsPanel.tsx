import React from 'react';
import { ThemeType, User } from '@/types';

interface SettingsPanelProps {
    show: boolean;
    onClose: () => void;
    theme: ThemeType;
    setTheme: (theme: ThemeType) => void;
    currentUser: User;
    tempName: string;
    setTempName: (name: string) => void;
    fontSize: number;
    setFontSize: (size: number) => void;
    isMobile: boolean;
    isImmersiveMode: boolean;
    setIsImmersiveMode: (mode: boolean) => void;
    onLogoClick: () => void;
    onLogoutGM: () => void;
    onOpenSuggestions: () => void;
    onSave: (e: React.FormEvent) => void;
}

export const SettingsPanel = ({
    show,
    onClose,
    theme,
    setTheme,
    currentUser,
    tempName,
    setTempName,
    fontSize,
    setFontSize,
    isMobile,
    isImmersiveMode,
    setIsImmersiveMode,
    onLogoClick,
    onLogoutGM,
    onOpenSuggestions,
    onSave
}: SettingsPanelProps) => {
    if (!show) return null;

    return (
        <div className={`fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-2xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40' : 'bg-black/60'}`}>
            <div className="absolute inset-0" onClick={() => currentUser.name !== '游客' && onClose()} />
            <div className={`w-full max-sm:max-w-none max-w-sm crystal-black-outer p-5 rounded-[32px] container-rainbow-main flex flex-col gap-4 animate-in zoom-in-95 duration-500 relative ${theme === 'light' ? 'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]' : 'shadow-[0_0_100px_rgba(0,0,0,0.5)]'}`}>
                {currentUser.name !== '游客' && (
                    <button onClick={onClose} className={`absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-all z-50 border ${theme === 'light' ? 'bg-black/5 text-black/40 hover:text-black border-black/5' : 'bg-white/5 text-white/40 hover:text-white border-white/5'}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}

                <div className="flex flex-col gap-1 px-1">
                    <div className="flex items-center gap-2">
                        <img src="/logo.png" onClick={onLogoClick} className="w-6 h-6 object-contain cursor-pointer active:scale-90 transition-transform" alt="Logo" />
                        <h3 className={`text-xs font-normal uppercase tracking-tight ${theme === 'light' ? 'text-black/60' : 'text-white/50'}`}>乌托邦</h3>
                    </div>
                    <p className={`text-[9px] font-normal uppercase tracking-wider ${theme === 'light' ? 'text-black/40' : 'text-white/35'}`}>Privacy secured with 2km random offset</p>
                </div>

                <form onSubmit={onSave} className="flex flex-col gap-3.5 pt-1">
                    <input
                        type="text"
                        maxLength={12}
                        placeholder="在这更改昵称"
                        className={`w-full border rounded-xl px-4 py-2.5 font-normal outline-none ring-2 ring-transparent transition-all text-sm ${theme === 'light' ? 'bg-black/5 border-black/10 text-black placeholder:text-black/35 focus:ring-black/5' : 'bg-white/5 border-white/10 text-white placeholder:text-white/35 focus:ring-white/10'}`}
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        autoFocus
                    />
                    <div className="grid grid-cols-2 gap-2.5 select-none">
                        <div onClick={() => setTheme('dark')} className={`py-2 px-4 rounded-xl border flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-95 ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 opacity-50 hover:opacity-80'}`}>
                            <div className="w-5 h-5 rounded-full bg-[#1a1a1a] border border-white/20 shadow-[0_0_100px_rgba(255,255,255,0.1)] flex-shrink-0" /><span className="text-[11px] font-normal text-white/80 tracking-tight uppercase">深色</span>
                        </div>
                        <div onClick={() => setTheme('light')} className={`py-2 px-4 rounded-xl border flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-95 ${theme === 'light' ? 'bg-white border-white text-black' : 'bg-transparent border-white/5 opacity-50 hover:opacity-80'}`}>
                            <div className="w-5 h-5 rounded-full bg-white border border-gray-200 shadow-sm flex-shrink-0" /><span className={`text-[11px] font-normal tracking-tight uppercase ${theme === 'light' ? 'text-black' : 'text-white/80'}`}>浅色</span>
                        </div>
                    </div>

                    {isMobile && (
                        <div
                            onClick={() => {
                                const newVal = !isImmersiveMode;
                                setIsImmersiveMode(newVal);
                                localStorage.setItem('whisper_immersive_mode', String(newVal));
                            }}
                            className={`py-3 px-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all active:scale-95 ${theme === 'light' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}
                        >
                            <span className={`text-[11px] font-normal uppercase tracking-tight ${theme === 'light' ? 'text-black/80' : 'text-white/80'}`}>沉浸模式 (隐藏地图)</span>
                            <div className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${isImmersiveMode ? 'bg-green-500' : (theme === 'light' ? 'bg-black/20' : 'bg-white/20')}`}>
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300 ${isImmersiveMode ? 'left-[22px]' : 'left-1'}`} />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 p-1">
                        <div className={`flex items-center justify-between text-[11px] font-normal uppercase tracking-tight px-1 ${theme === 'light' ? 'text-black/60' : 'text-white/40'}`}>
                            <span>文字大小</span>
                            <span>{fontSize}px</span>
                        </div>
                        <input
                            type="range"
                            min="12"
                            max="24"
                            step="1"
                            value={fontSize}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setFontSize(val);
                                localStorage.setItem('whisper_font_size', val.toString());
                            }}
                            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-black/10 accent-black' : 'bg-white/10 accent-white'}`}
                        />
                    </div>

                    {currentUser.isGM && (
                        <button
                            type="button"
                            onClick={onLogoutGM}
                            className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 transition-all active:scale-95 bg-red-500/10 border-red-500/20 text-red-500 text-xs font-normal uppercase tracking-wider`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            退出超级权限 (老蔡)
                        </button>
                    )}

                    <div className={`p-3 border rounded-2xl flex flex-col gap-2 ${theme === 'light' ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                            <span className={`text-[10px] font-normal uppercase tracking-tight ${theme === 'light' ? 'text-black/70' : 'text-white/70'}`}>隐私保护说明</span>
                        </div>
                        <p className={`text-[10px] font-normal leading-relaxed lowercase tracking-wide ${theme === 'light' ? 'text-black/50' : 'text-white/45'}`}>
                            为了保护您的驻地隐私，系统已自动为您的实时位置添加约 **2公里** 的随机偏移。这意味着即使在"地区"频道中，其他用户也无法精确推断您的真实住所。
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        <button type="button" onClick={onOpenSuggestions} className={`w-full py-2.5 font-normal uppercase tracking-[0.2em] rounded-xl active:scale-[0.98] transition-all border text-xs ${theme === 'light' ? 'bg-black/5 text-black/50 hover:bg-black/10 border-black/5' : 'bg-white/5 text-white/50 hover:bg-white/10 border-white/5'}`}>提建议</button>
                        <button type="submit" className="w-full py-2.5 bg-white text-black font-normal uppercase tracking-[0.2em] rounded-xl active:scale-[0.98] transition-all hover:shadow-[0_0_30_px_rgba(255,255,255,0.3)] shadow-xl text-xs">保存</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
