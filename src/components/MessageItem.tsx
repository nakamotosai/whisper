import React, { memo } from 'react';
import { Message, User, ThemeType } from '@/types';
import { formatTimeSimple } from '@/lib/utils';

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

    const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);
    const isMoving = React.useRef(false);
    // Track touch start position for better scroll detection
    const touchStartPos = React.useRef<{ x: number, y: number } | null>(null);

    const handleShowMenu = (e: React.MouseEvent | React.PointerEvent | React.TouchEvent) => {
        if (msg.isRecalled) return;
        if ('stopPropagation' in e) e.stopPropagation();
        onSetActiveMenu(msg.id);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        isMoving.current = false;
        // Record touch start position
        const touch = e.touches[0];
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };

        // Increased threshold from 600ms to 800ms to reduce accidental triggers
        longPressTimer.current = setTimeout(() => {
            if (!isMoving.current) {
                handleShowMenu(e);
            }
        }, 800);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        touchStartPos.current = null;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // Only cancel if moved more than 15px (to avoid accidental cancellation from finger jitter)
        if (touchStartPos.current) {
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - touchStartPos.current.x);
            const dy = Math.abs(touch.clientY - touchStartPos.current.y);
            if (dx > 15 || dy > 15) {
                isMoving.current = true;
                if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                }
            }
        }
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

    const renderImages = () => {
        const urls = msg.content.split(',');
        const count = urls.length;

        if (count === 1) {
            return (
                <div
                    className={`relative cursor-zoom-in overflow-hidden rounded-[20px] shadow-2xl transition-transform active:scale-[0.98] ${isOwn ? 'bubble-rainbow' : (theme === 'light' ? 'bg-white/40 border-black/5' : 'bg-[#1a1a1a]/40 border-white/5')}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isActiveMenu) onUnsetActiveMenu();
                        else onViewImage(urls[0]);
                    }}
                    onContextMenu={(e) => { e.preventDefault(); handleShowMenu(e); }}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                >
                    <img src={urls[0]} className="w-56 md:w-64 h-auto max-h-[384px] object-cover block" alt="Image 0" />
                </div>
            );
        }

        // Logic for multi-image tiled grid
        let containerClass = "grid gap-1 p-1 rounded-[24px] overflow-hidden transition-all shadow-2xl w-[260px] md:w-[300px]";

        if (count === 2) containerClass += " grid-cols-2 aspect-[3/2]";
        else if (count === 3) containerClass += " grid-cols-2 grid-rows-2 aspect-square";
        else if (count === 4) containerClass += " grid-cols-2 grid-rows-2 aspect-square";
        else containerClass += " grid-cols-3 aspect-square";

        return (
            <div className={`${containerClass} ${isOwn ? 'bubble-rainbow' : (theme === 'light' ? 'bg-white/40 backdrop-blur-md border border-black/5' : 'bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5')}`}>
                {urls.map((url, i) => {
                    let itemClass = "relative cursor-zoom-in overflow-hidden rounded-[14px] bg-black/5";

                    if (count === 3) {
                        if (i === 0) itemClass += " row-span-2 h-full";
                        else itemClass += " h-full";
                    } else if (count === 2 || count === 4) {
                        itemClass += " h-full";
                    } else {
                        itemClass += " aspect-square";
                    }

                    return (
                        <div
                            key={i}
                            className={itemClass}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isActiveMenu) onUnsetActiveMenu();
                                else onViewImage(url);
                            }}
                            onContextMenu={(e) => { e.preventDefault(); handleShowMenu(e); }}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                            style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                        >
                            <img src={url} loading="lazy" className="w-full h-full object-cover block transition-transform duration-500 hover:scale-105" alt={`Photo ${i}`} />
                        </div>
                    );
                })}
            </div>
        );
    };

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
                    {isImg ? renderImages() : (
                        <div
                            onClick={(e) => {
                                if (isActiveMenu) return onUnsetActiveMenu();
                                if (isVoice) onPlayVoice(msg.content);
                            }}
                            onContextMenu={(e) => { e.preventDefault(); handleShowMenu(e); }}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                            style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                            className={`relative px-4 flex-col items-start justify-center min-h-[34px] rounded-[20px] transition-all duration-500 w-fit shadow-xl cursor-pointer active:scale-[0.98] select-none ${isVoice ? 'justify-center min-w-[120px]' : ''} ${isOwn ? `bubble-rainbow ${theme === 'light' ? 'text-gray-900' : 'text-white'}` : (theme === 'light' ? 'bg-white/60 backdrop-blur-md text-black/90 border border-black/5' : 'bg-[#1a1a1a]/40 backdrop-blur-md text-white/90 border border-white/5')}`}
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
                                        {msg.voiceDuration || 0}&quot;
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
                        <div className={`absolute -top-12 ${isOwn ? 'right-0' : 'left-0'} z-[100] flex gap-1.5 animate-in zoom-in-95 fade-in slide-in-from-bottom-2 duration-300`}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    let content = msg.content;
                                    if (msg.type === 'voice') content = '[语音]';
                                    if (msg.type === 'image') content = '[图片]';
                                    onQuote({ userName: msg.userName, content });
                                    onUnsetActiveMenu();
                                }}
                                className={`px-4 py-2 rounded-full backdrop-blur-2xl border text-[12px] font-medium tracking-wide transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${theme === 'light' ? 'bg-white/80 border-black/5 text-black hover:bg-white' : 'bg-white/10 border-white/10 text-white hover:bg-white/20'}`}
                            >
                                引用
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (msg.type === 'text') {
                                        navigator.clipboard.writeText(msg.content).then(() => {
                                            alert('已复制到剪贴板');
                                        }).catch(() => {
                                            alert('复制失败');
                                        });
                                    } else {
                                        alert('仅支持复制文字消息');
                                    }
                                    onUnsetActiveMenu();
                                }}
                                className={`px-4 py-2 rounded-full backdrop-blur-2xl border text-[12px] font-medium tracking-wide transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${theme === 'light' ? 'bg-white/80 border-black/5 text-black hover:bg-white' : 'bg-white/10 border-white/10 text-white hover:bg-white/20'}`}
                            >
                                复制
                            </button>

                            {/* Recall button - only show if within 30 mins and is own message. Using state to avoid hydration mismatch. */}
                            {isOwn && canRecall && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRecall(msg.id);
                                        onUnsetActiveMenu();
                                    }}
                                    className={`px-4 py-2 rounded-full backdrop-blur-2xl border text-[12px] font-medium tracking-wide transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${theme === 'light' ? 'bg-white/80 border-black/5 text-black hover:bg-white' : 'bg-white/10 border-white/10 text-white hover:bg-white/20'}`}
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
                                        className={`px-4 py-2 rounded-full backdrop-blur-2xl border text-[12px] font-bold tracking-wide transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.3)] bg-amber-500/80 border-amber-400/20 text-white hover:bg-amber-500`}
                                    >
                                        改名
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('确定要永久抹除这条记录吗？') && onDelete) onDelete(msg.id);
                                            onUnsetActiveMenu();
                                        }}
                                        className={`px-4 py-2 rounded-full backdrop-blur-2xl border text-[12px] font-bold tracking-wide transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.3)] bg-red-500/80 border-red-400/20 text-white hover:bg-red-500`}
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
                                            className={`px-4 py-2 rounded-full backdrop-blur-2xl border text-[12px] font-medium tracking-wide transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ${theme === 'light' ? 'bg-white/80 border-black/5 text-black hover:bg-white' : 'bg-white/10 border-white/10 text-white hover:bg-white/20'}`}
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
        </div >
    );
});

MessageItem.displayName = 'MessageItem';
