import React from 'react';
import { ThemeType } from '@/types';

interface GMPromptProps {
    show: boolean;
    onClose: () => void;
    theme: ThemeType;
    password: string;
    setPassword: (curr: string) => void;
    isLoggingIn: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

export const GMPrompt = ({
    show,
    onClose,
    theme,
    password,
    setPassword,
    isLoggingIn,
    onSubmit
}: GMPromptProps) => {
    if (!show) return null;

    return (
        <div className={`fixed inset-0 z-[30000] flex items-center justify-center p-6 backdrop-blur-2xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40' : 'bg-black/60'}`}>
            <div className="w-full max-sm:max-w-none max-w-xs crystal-black-outer p-6 rounded-[32px] container-rainbow-main flex flex-col gap-6 animate-in zoom-in-95 duration-500 relative">
                <div className="flex flex-col gap-2 items-center">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border mb-2 ${theme === 'light' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                        <svg className={`w-6 h-6 ${theme === 'light' ? 'text-black/40' : 'text-white/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h3 className={`text-base font-normal uppercase tracking-[0.3em] ${theme === 'light' ? 'text-black' : 'text-white'}`}>身份验证</h3>
                    <p className={`text-[12px] uppercase font-normal tracking-tight text-center ${theme === 'light' ? 'text-black/50' : 'text-white/40'}`}>输入秘密协议码以激活超级权限</p>
                </div>
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <input
                        type="password"
                        placeholder="密码"
                        className={`w-full border rounded-xl px-4 py-3 font-normal outline-none ring-2 ring-transparent transition-all text-center tracking-[0.5em] ${theme === 'light' ? 'bg-black/5 border-black/10 text-black placeholder:text-black/20 focus:ring-black/5' : 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:ring-white/10'}`}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className={`flex-1 py-3 font-normal uppercase tracking-tight rounded-xl text-[12px] border ${theme === 'light' ? 'bg-black/5 text-black/50 border-black/5' : 'bg-white/5 text-white/40 border-white/5'}`}>关闭</button>
                        <button type="submit" disabled={isLoggingIn} className={`flex-1 py-3 font-normal uppercase tracking-tight rounded-xl text-[12px] transition-all active:scale-95 ${theme === 'light' ? 'bg-black text-white shadow-xl' : 'bg-white text-black shadow-xl'}`}>{isLoggingIn ? '验证中...' : '提交'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
