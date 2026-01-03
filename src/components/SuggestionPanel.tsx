import React, { useRef, useEffect } from 'react';
import { ThemeType, User, Suggestion } from '@/types';

interface SuggestionPanelProps {
    show: boolean;
    onClose: () => void;
    theme: ThemeType;
    suggestions: Suggestion[];
    currentUser: User;
    onLogoClick: () => void;
    suggestionText: string;
    setSuggestionText: (text: string) => void;
    suggestionStatus: string;
    isSubmitting: boolean;
    onSubmit: (e: React.FormEvent) => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const SuggestionPanel = ({
    show,
    onClose,
    theme,
    suggestions,
    currentUser,
    onLogoClick,
    suggestionText,
    setSuggestionText,
    suggestionStatus,
    isSubmitting,
    onSubmit,
    scrollRef
}: SuggestionPanelProps) => {
    if (!show) return null;

    return (
        <div className={`fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-2xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40' : 'bg-black/60'}`}>
            <div className={`w-full max-w-[500px] h-[85vh] crystal-black-outer rounded-[40px] container-rainbow-main flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-700 relative ${theme === 'light' ? 'shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)]' : 'shadow-[0_0_150px_rgba(0,0,0,0.8)]'}`}>
                <div className={`p-6 border-b flex items-center justify-between backdrop-blur-xl ${theme === 'light' ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <img src="/logo.png" onClick={onLogoClick} className="w-8 h-8 object-contain cursor-pointer active:scale-90 transition-transform" alt="Logo" />
                            <h2 className={`text-lg font-normal tracking-tight uppercase ${theme === 'light' ? 'text-black' : 'text-white'}`}>进化建议看板</h2>
                        </div>
                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className={`text-[10px] font-normal uppercase tracking-tight ${theme === 'light' ? 'text-black/50' : 'text-white/50'}`}>实时接收其他特工建议</span></div>
                    </div>
                    <button onClick={onClose} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${theme === 'light' ? 'bg-black/5 text-black/40 hover:text-black border-black/5' : 'bg-white/5 text-white/40 hover:text-white border-white/5'}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth custom-scrollbar overscroll-contain">
                    {suggestions.length === 0 ? <div className={`h-full flex flex-col items-center justify-center underline uppercase tracking-tight ${theme === 'light' ? 'text-black/20' : 'text-white/20'}`}>暂无建议</div> : suggestions.map((s, idx) => (
                        <div key={s.id || idx} className={`flex flex-col gap-2 ${s.user_id === currentUser.id ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 px-1"><span className={`text-[10px] font-normal uppercase tracking-tighter ${theme === 'light' ? 'text-black/50' : 'text-white/40'}`}>{s.user_id === currentUser.id ? '我' : s.user_name}</span><span className={`text-[8px] font-normal tabular-nums lowercase ${theme === 'light' ? 'text-black/30' : 'text-white/20'}`}>{s.timestamp ? new Date(s.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '刚刚'}</span></div>
                            <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] font-normal leading-relaxed border shadow-sm ${s.user_id === currentUser.id
                                ? `rounded-tr-none ${theme === 'light' ? 'bg-black/10 border-black/10 text-black' : 'bg-white/15 border-white/30 text-white'}`
                                : `rounded-tl-none ${theme === 'light' ? 'bg-black/5 border-black/5 text-black/80' : 'bg-white/5 border-white/10 text-white/80'}`
                                }`}>{s.content}</div>
                        </div>
                    ))}
                </div>
                <div className={`p-6 border-t backdrop-blur-2xl ${theme === 'light' ? 'bg-white/40 border-black/5' : 'bg-black/40 border-white/10'}`}>
                    <form onSubmit={onSubmit} className="flex flex-col gap-4">
                        <textarea className={`w-full h-24 border rounded-2xl p-4 font-normal outline-none ring-2 ring-transparent transition-all resize-none text-sm leading-relaxed ${theme === 'light' ? 'bg-black/5 border-black/10 text-black placeholder:text-black/30 focus:ring-black/5' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:ring-white/10'}`} placeholder="输入建议..." value={suggestionText} onChange={(e) => setSuggestionText(e.target.value)} />
                        <button type="submit" disabled={isSubmitting || !suggestionText.trim()} className={`w-full py-4 rounded-xl font-normal uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${suggestionStatus === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : (theme === 'light' ? 'bg-black text-white hover:shadow-[0_0_30px_rgba(0,0,0,0.2)] shadow-xl' : 'bg-white text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] shadow-xl')}`}>{isSubmitting ? '发送中...' : suggestionStatus === 'success' ? '已发送' : '发送进化建议'}</button>
                    </form>
                </div>
            </div>
        </div>
    );
};
