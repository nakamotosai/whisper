import React, { memo } from 'react';
import { Message, User, ThemeType } from '@/types';

const formatTimeSimple = (date: Date) => {
    try {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
        return '';
    }
};

interface MessageItemProps {
    msg: Message;
    prevMsg: Message | null;
    nextMsg: Message | null;
    user: User;
    theme: ThemeType;
    isActiveMenu: boolean;
    playingAudioUrl: string | null;
    fontSize: number;
    index: number;
    // Actions
    onUnsetActiveMenu: () => void;
    onSetActiveMenu: (id: string) => void;
    onRecall: (id: string) => void;
    onDelete?: (id: string) => void;
    onUpdateName?: (id: string, name: string) => void;
    onQuote: (reply: { userName: string; content: string }) => void;
    onPlayVoice: (url: string) => void;
    onViewImage: (url: string) => void;
    onAddMention: (name: string) => void;
    readCount?: number;
}

export const MessageItem = memo(({
    msg, prevMsg, nextMsg, user, theme, isActiveMenu, playingAudioUrl, fontSize, index,
    onUnsetActiveMenu, onSetActiveMenu, onRecall, onDelete, onUpdateName, onQuote, onPlayVoice, onViewImage, onAddMention, readCount = 0
}: MessageItemProps) => {
    const isOwn = msg.userId === user.id;
    const isFirstInGroup = !prevMsg || prevMsg.userId !== msg.userId || (msg.timestamp - prevMsg.timestamp > 5 * 60 * 1000);
    const isVoice = msg.type === 'voice';
    const isImg = msg.type === 'image';

    const handleMessageClick = (e: React.MouseEvent) => {
        if (msg.isRecalled) return;
        e.stopPropagation();
        onSetActiveMenu(msg.id);
    };

    if (msg.isRecalled) {
        return (
            <div data-index={index} className="w-full px-2 flex justify-center my-1">
                <span className={`text-[12px] bg-black/5 ${theme === 'light' ? 'text-black/50' : 'text-white/40'} px-3 py-1 rounded-full flex items-center gap-1.5`}>
                    <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {isOwn ? '你撤回了一条消息' : `${msg.userName} 撤回了一条消息`}
                </span>
            </div>
        );
    }

    return (
        <div
            data-index={index}
            className={`w-full px-2 flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'pt-3' : 'pt-1'}`}
        >
            {isFirstInGroup && (
                <div className={`mb-1 px-1 text-[11px] font-normal uppercase tracking-tighter flex items-center gap-1.5 ${isOwn ? (theme === 'light' ? 'text-black/60' : 'text-white/55') : (theme === 'light' ? 'text-black/50' : 'text-white/40')}`}>
                    <span
                        className={`cursor-pointer transition-opacity hover:opacity-70 ${msg.isGM ? 'text-rainbow-scroll scale-110 origin-left inline-block' : ''}`}
                        onClick={() => onAddMention(msg.userName)}
                    >
                        {msg.userName || `NODE_${msg.userId.substring(0, 4)}`}
                    </span>
                    {(msg.countryCode || true) && (
                        <>
                            <span className="opacity-40 mx-0.5">·</span>
                            <div className="flex items-center gap-1 opacity-40 tabular-nums">
                                {msg.countryCode && <span>{msg.countryCode}</span>}
                                {msg.countryCode && <span className="mx-0.5">·</span>}
                                <span>{formatTimeSimple(new Date(msg.timestamp))}</span>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className={`flex ${isOwn ? 'flex-row items-end justify-end' : 'flex-row items-end'} w-full`}>
                {isOwn && (!nextMsg || nextMsg.userId !== msg.userId || (nextMsg.timestamp - msg.timestamp > 5 * 60 * 1000)) && readCount > 0 && (
                    <div className="flex flex-col justify-end h-full mb-[2px] mr-1.5 animate-in fade-in duration-500">
                        <span className="text-[10px] text-yellow-500/90 font-medium whitespace-nowrap leading-none tabular-nums">已读 {readCount}</span>
                    </div>
                )}

                <div className={`relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} group/bubble max-w-[85%]`}>
                    {msg.replyTo && (
                        <div className={`mb-1 p-2 rounded-xl text-[12px] border shadow-sm backdrop-blur-md transition-all 
                            ${isOwn
                                ? `mr-1 ${theme === 'light' ? 'border-black/5 bg-black/[0.04] text-black/70' : 'border-white/10 bg-white/15 text-white/85'}`
                                : `ml-1 ${theme === 'light' ? 'border-black/5 bg-black/[0.04] text-black/70' : 'border-white/5 bg-white/5 text-white/40'}`
                            }`}>
                            <div className="font-normal mb-0.5 truncate max-w-[150px]">{msg.replyTo.userName}</div>
                            <div className="opacity-80 line-clamp-1 truncate max-w-[150px]">{msg.replyTo.content}</div>
                        </div>
                    )}
                    {isImg ? (
                        <div
                            className={`relative cursor-zoom-in rounded-[20px] transition-all shadow-xl p-[1.5px] overflow-hidden ${isOwn ? 'bubble-rainbow' : (theme === 'light' ? 'bg-white/40 backdrop-blur-md border border-black/5 mx-[0.5px]' : 'bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 mx-[0.5px]')}`}
                            onClick={(e) => isActiveMenu ? onUnsetActiveMenu() : onViewImage(msg.content)}
                            onContextMenu={(e) => { e.preventDefault(); handleMessageClick(e); }}
                            onPointerDown={(e) => {
                                const timer = setTimeout(() => handleMessageClick(e as any), 600);
                                const clear = () => clearTimeout(timer);
                                e.currentTarget.addEventListener('pointerup', clear, { once: true });
                                e.currentTarget.addEventListener('pointerleave', clear, { once: true });
                            }}
                        >
                            <div className="rounded-[18.5px] overflow-hidden w-20 h-20 md:w-24 md:h-24">
                                <img src={msg.content} loading="lazy" className="w-full h-full object-cover block" alt="Thumbnail" />
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={(e) => {
                                if (isActiveMenu) return onUnsetActiveMenu();
                                if (isVoice) onPlayVoice(msg.content);
                            }}
                            onContextMenu={(e) => { e.preventDefault(); handleMessageClick(e); }}
                            onPointerDown={(e) => {
                                const timer = setTimeout(() => handleMessageClick(e as any), 600);
                                const clear = () => clearTimeout(timer);
                                e.currentTarget.addEventListener('pointerup', clear, { once: true });
                                e.currentTarget.addEventListener('pointerleave', clear, { once: true });
                            }}
                            className={`relative px-4 flex-col items-start justify-center min-h-[34px] rounded-[20px] transition-all duration-500 w-fit shadow-xl cursor-pointer active:scale-[0.98] ${isVoice ? 'justify-center min-w-[120px]' : ''} ${isOwn ? `bubble-rainbow ${theme === 'light' ? 'text-gray-900' : 'text-white'}` : (theme === 'light' ? 'bg-white/60 backdrop-blur-md text-black/90 border border-black/5' : 'bg-[#1a1a1a]/40 backdrop-blur-md text-white/90 border border-white/5')}`}
                        >
                            {isVoice ? (
                                <div className="flex items-center gap-3 w-full py-2">
                                    <div className={`flex items-center justify-center transition-all shrink-0 ${playingAudioUrl === msg.content ? (theme === 'light' ? 'text-black' : 'text-white') : (theme === 'light' ? 'text-black/60' : 'text-white/80')}`}>
                                        {playingAudioUrl === msg.content ? (
                                            <div className="flex gap-[1.5px] items-center justify-center">
                                                <div className="w-[2px] h-2.5 bg-current rounded-full" />
                                                <div className="w-[2px] h-2.5 bg-current rounded-full" />
                                            </div>
                                        ) : (
                                            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[7px] border-l-current border-b-[4px] border-b-transparent ml-[2px]" />
                                        )}
                                    </div>
                                    <div className="flex items-end gap-[2.5px] h-4 opacity-80 flex-1">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(i => {
                                            const h = 30 + (Math.sin(i * 0.8) * 20 + 20);
                                            return (
                                                <div
                                                    key={i}
                                                    className={`w-[2px] rounded-full transition-all duration-500 ${playingAudioUrl === msg.content ? 'animate-wave-bounce' : ''} ${theme === 'light' ? 'bg-black/80' : 'bg-white/80'}`}
                                                    style={{
                                                        height: `${h}%`,
                                                        animationDelay: `${i * 0.08}s`
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div className={`text-[12px] font-normal font-mono shrink-0 ml-1 ${theme === 'light' ? 'text-black/40' : 'text-white/50'}`}>
                                        {msg.voiceDuration || 0}"
                                    </div>
                                </div>
                            ) : (
                                <span
                                    className="font-normal leading-tight block py-2 whitespace-pre-wrap"
                                    style={{ fontSize: `${fontSize}px` }}
                                >
                                    {msg.content.split(/(@\S+)/g).map((part, i) =>
                                        part.startsWith('@') ? (
                                            <span key={i} className="text-blue-400 font-normal">{part}</span>
                                        ) : part
                                    )}
                                </span>
                            )}
                        </div>
                    )}

                    {isActiveMenu && (
                        <div className={`absolute -top-10 ${isOwn ? 'right-0' : 'left-0'} z-50 flex gap-2 animate-in zoom-in-95 fade-in duration-200`}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    let content = msg.content;
                                    if (msg.type === 'voice') content = '[语音]';
                                    if (msg.type === 'image') content = '[图片]';
                                    onQuote({ userName: msg.userName, content });
                                    onUnsetActiveMenu();
                                }}
                                className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl ${theme === 'light' ? 'bg-white/90 text-black' : 'bg-black/90 text-white'}`}
                            >
                                引用
                            </button>
                            {isOwn && (Date.now() - msg.timestamp < 30 * 60 * 1000) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRecall(msg.id);
                                        onUnsetActiveMenu();
                                    }}
                                    className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl ${theme === 'light' ? 'bg-white/90 text-black' : 'bg-black/90 text-white'}`}
                                >
                                    撤回
                                </button>
                            )}
                            {user.isGM && (
                                <>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newName = prompt('输入该用户的新代号:', msg.userName);
                                            if (newName && onUpdateName) onUpdateName(msg.userId, newName);
                                            onUnsetActiveMenu();
                                        }}
                                        className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl bg-amber-500/90 text-white`}
                                    >
                                        改名
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('确定要永久抹除这条记录吗？') && onDelete) onDelete(msg.id);
                                            onUnsetActiveMenu();
                                        }}
                                        className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl bg-red-500/90 text-white`}
                                    >
                                        抹除
                                    </button>
                                    {!isOwn && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRecall(msg.id);
                                                onUnsetActiveMenu();
                                            }}
                                            className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl ${theme === 'light' ? 'bg-white/90 text-black' : 'bg-black/90 text-white'}`}
                                        >
                                            撤回
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

MessageItem.displayName = 'MessageItem';
