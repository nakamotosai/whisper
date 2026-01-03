'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ScaleLevel, Message, User, SubTabType, LiveStream, SharedImage, ThemeType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getCountryNameCN } from '@/lib/spatialService';

const formatTimeSimple = (date: Date) => {
    try {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
        return '';
    }
};

interface ChatInterfaceProps {
    scale: ScaleLevel;
    roomId: string;
    messages: Message[];
    unreadCounts: Record<ScaleLevel, number>;
    user: User;
    onSendMessage: (content: string, replyTo?: Message['replyTo']) => Promise<void>;
    onUploadImage: (file: File, replyTo?: Message['replyTo']) => Promise<void>;
    onUploadVoice: (blob: Blob, duration: number, replyTo?: Message['replyTo']) => Promise<void>;
    onRecallMessage: (messageId: string) => Promise<void>;
    fetchLiveStreams: (roomId: string) => Promise<LiveStream[]>;
    fetchSharedImages: (roomId: string) => Promise<SharedImage[]>;
    isOpen: boolean;
    onToggle: () => void;
    onTabChange: (scale: ScaleLevel) => void;
    onUpdateUser: (userData: Partial<User>) => void;
    onOpenSettings?: () => void;
    isMobile?: boolean;
    locationName?: string;
    theme?: ThemeType;
    onlineCounts?: Record<ScaleLevel, number>;
    onLoadMore?: (scale: ScaleLevel) => Promise<void>;
    hasMore?: boolean;
    onDeleteMessage?: (messageId: string) => Promise<void>;
    onUpdateAnyUserName?: (userId: string, newName: string) => Promise<void>;
    fontSize?: number;
    mentionCounts?: Record<ScaleLevel, number>;
    onTyping?: (isTyping: boolean) => void;
    typingUsers?: string[];
}

const SCALE_OPTIONS_TRANS = { WORLD: '世界', CITY: '城市', DISTRICT: '地区' };
const COMMON_EMOJIS = ['😂', '😍', '🤔', '👍', '🔥', '✨', '🎉', '❤️', '🙌', '👀', '🚀', '👋', '😭', '😎', '💀', '💯', '🌈', '🍦', '⚡️', '😀'];

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    scale, roomId, messages, unreadCounts, user, onSendMessage, onUploadImage, onUploadVoice, onRecallMessage,
    fetchLiveStreams, fetchSharedImages, isOpen, onToggle, onTabChange, onUpdateUser, onOpenSettings, isMobile = false, locationName, theme = 'dark', onlineCounts,
    onLoadMore, hasMore = false, onDeleteMessage, onUpdateAnyUserName, fontSize = 16,
    mentionCounts = { [ScaleLevel.DISTRICT]: 0, [ScaleLevel.CITY]: 0, [ScaleLevel.WORLD]: 0 },
    onTyping, typingUsers = []
}) => {
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<SubTabType>('CHAT');
    const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [quotedMessage, setQuotedMessage] = useState<Message['replyTo'] | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [showNewMessageTip, setShowNewMessageTip] = useState(false);

    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [galleryImages, setGalleryImages] = useState<SharedImage[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 80,
        overscan: 5,
    });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isTypingRef = useRef(false);
    const recordingStartTimeRef = useRef<number>(0);
    const audioObjRef = useRef<HTMLAudioElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastScrollHeight = useRef<number>(0);
    const isAutoScrolling = useRef<boolean>(false);
    const lastMessageId = useRef<string | null>(null);
    const lastRoomId = useRef<string | null>(null);
    const lastSubTab = useRef<SubTabType>('CHAT');



    const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            container.scrollTo({ top: container.scrollHeight + 1000, behavior });
            setShowNewMessageTip(false);

            requestAnimationFrame(() => {
                if (container) container.scrollTo({ top: container.scrollHeight + 1000, behavior });
            });
        }
    };

    useEffect(() => {
        if (activeSubTab === 'IMAGES' && roomId) {
            fetchSharedImages(roomId).then(setGalleryImages);
        } else if (roomId !== lastRoomId.current) {
            setGalleryImages([]);
        }
    }, [activeSubTab, roomId, fetchSharedImages]);

    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && (lastMsg.type === 'image' || lastMsg.content.includes('chat_images'))) {
            if (!galleryImages.some(img => img.id === lastMsg.id)) {
                setGalleryImages(prev => [{
                    id: lastMsg.id,
                    url: lastMsg.content,
                    caption: '',
                    author: lastMsg.userName,
                    likes: 0,
                    lat: 0,
                    lng: 0,
                    timestamp: lastMsg.timestamp
                }, ...prev]);
            }
        }
    }, [messages]);

    useEffect(() => {
        if (activeSubTab === 'CHAT' && scrollRef.current && isOpen) {
            const container = scrollRef.current;
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;

            const currentLastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const currentLastId = currentLastMsg?.id || null;

            const roomChanged = roomId !== lastRoomId.current;
            const subTabChangedToChat = activeSubTab === 'CHAT' && lastSubTab.current !== 'CHAT';

            if (roomChanged || subTabChangedToChat) {
                lastMessageId.current = null;
                lastRoomId.current = roomId;
                lastSubTab.current = activeSubTab;
                requestAnimationFrame(() => {
                    scrollToBottom('auto');
                });
                return;
            }

            const isInitialLoad = lastMessageId.current === null && currentLastId !== null;
            const hasNewerMessage = currentLastId !== null && currentLastId !== lastMessageId.current;

            if (isInitialLoad) {
                requestAnimationFrame(() => {
                    scrollToBottom('auto');
                });
            } else if (hasNewerMessage) {
                const lastMsgIsOwn = currentLastMsg?.userId === user.id;
                if (isNearBottom || isAutoScrolling.current || lastMsgIsOwn) {
                    scrollToBottom('smooth');
                    setShowNewMessageTip(false);
                } else {
                    setShowNewMessageTip(true);
                }
            }

            if (lastScrollHeight.current > 0) {
                const heightDiff = container.scrollHeight - lastScrollHeight.current;
                if (heightDiff > 0) {
                    container.scrollTop = container.scrollTop + heightDiff;
                }
                lastScrollHeight.current = 0;
            }

            lastMessageId.current = currentLastId;
            lastSubTab.current = activeSubTab;
        } else {
            lastSubTab.current = activeSubTab;
        }
    }, [messages, isOpen, activeSubTab, scale, roomId]);

    useEffect(() => {
        const handleClickOutside = () => {
            setActiveMenuId(null);
            setShowEmojiPicker(false);
        };
        if (activeMenuId || showEmojiPicker) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [activeMenuId, showEmojiPicker]);

    useEffect(() => {
        if (!onTyping || !isOpen) return;
        if (inputText.length > 0) {
            if (!isTypingRef.current) {
                isTypingRef.current = true;
                onTyping(true);
            }
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                isTypingRef.current = false;
                onTyping(false);
            }, 2000);
        } else if (isTypingRef.current) {
            isTypingRef.current = false;
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            onTyping(false);
        }
    }, [inputText, isOpen, onTyping]);

    const handleScroll = async () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollHeight - scrollTop - clientHeight < 50) {
            setShowNewMessageTip(false);
        }
        if (scrollTop < 50 && hasMore && !isLoadingMore && activeSubTab === 'CHAT') {
            setIsLoadingMore(true);
            lastScrollHeight.current = scrollHeight;
            if (onLoadMore) {
                await onLoadMore(scale);
            }
            setIsLoadingMore(false);
        }
    };

    const startRecording = async () => {
        if (isRecording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recordingStartTimeRef.current = Date.now();
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                const duration = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                if (duration >= 1) {
                    setIsSending(true);
                    const reply = quotedMessage;
                    setQuotedMessage(null);
                    await onUploadVoice(audioBlob, duration, reply || undefined);
                    setIsSending(false);
                }
                stream.getTracks().forEach(t => t.stop());
            };
            recorder.start();
            setIsRecording(true);
            timerRef.current = setInterval(() => {
                setRecordingTime(Math.round((Date.now() - recordingStartTimeRef.current) / 1000));
            }, 1000);
        } catch (err) {
            console.error("Recording fail:", err);
        }
    };

    const stopRecording = () => {
        if (!isRecording) return;
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputText.trim() || isSending) return;
        setIsSending(true);
        const text = inputText.trim();
        const reply = quotedMessage;
        setInputText('');
        setQuotedMessage(null);
        try {
            isAutoScrolling.current = true;
            await onSendMessage(text, reply || undefined);
        } finally {
            setIsSending(false);
            setTimeout(() => {
                inputRef.current?.focus();
                isAutoScrolling.current = false;
            }, 10);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    onUploadImage(file);
                    e.preventDefault();
                }
            }
        }
    };

    const playVoice = (url: string) => {
        if (playingAudioUrl === url) {
            audioObjRef.current?.pause();
            setPlayingAudioUrl(null);
            return;
        }
        if (audioObjRef.current) audioObjRef.current.pause();
        const audio = new Audio(url);
        audioObjRef.current = audio;
        setPlayingAudioUrl(url);
        audio.onended = () => setPlayingAudioUrl(null);
        audio.play().catch(() => setPlayingAudioUrl(null));
    };

    const openViewer = (url: string) => {
        const idx = galleryImages.findIndex(item => item.url === url);
        if (idx !== -1) setViewerIndex(idx);
    };



    const handleMessageClick = (msg: Message, e: React.MouseEvent) => {
        if (msg.isRecalled) return;
        e.stopPropagation();
        setActiveMenuId(msg.id);
    };

    return (
        <div
            className={`flex flex-col h-full w-full overflow-hidden transition-all duration-700 relative crystal-black-outer ${isMobile ? 'rounded-[32px]' : 'rounded-[40px]'} container-rainbow-main ${theme === 'light' ? 'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]' : 'shadow-[0_20px_50px_rgba(0,0,0,0.5)]'}`}
            style={{ transform: 'translateZ(0)', touchAction: isMobile ? 'pan-y' : 'auto' }}
            onTouchMove={(e) => { if (isMobile) e.stopPropagation(); }}
            onTouchStart={(e) => { if (isMobile) e.stopPropagation(); }}
        >
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden text-clip">
                <div className={`absolute inset-0 transition-colors duration-700 ${theme === 'light' ? 'bg-white/20' : 'bg-black/10'}`} />
            </div>

            <div className={`shrink-0 z-30 transition-all duration-500 ${isMobile ? 'p-4 pt-1' : 'p-6 pt-1'} flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                    <div className={`flex-1 flex items-center backdrop-blur-md p-1 h-9 rounded-[18px] border transition-colors ${theme === 'light' ? 'bg-white/40 border-black/5' : 'bg-[#1a1a1a]/50 border-white/5'}`}>
                        {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
                            const isActive = scale === tab.value;
                            const hasUnread = unreadCounts[tab.value] > 0;
                            return (
                                <button key={tab.value} onClick={() => onTabChange(tab.value)}
                                    className={`flex-1 h-7 rounded-[14px] text-[12px] font-normal tracking-tight transition-all duration-500 uppercase flex items-center justify-center relative
                                        ${isActive ? (theme === 'light' ? 'text-gray-900 bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.1)]' : 'text-white bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.4)]') : (theme === 'light' ? 'text-black/30 hover:text-black/60' : 'text-white/40 hover:text-white/60')}`}>
                                    <span className="relative z-20">{tab.label}</span>
                                    {((mentionCounts[tab.value] || 0) > 0) && !isActive ? (
                                        <div className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 px-0.5 rounded-full bg-red-500 border border-white/20 flex items-center justify-center text-[8px] text-white font-bold animate-pulse z-30">
                                            @
                                        </div>
                                    ) : (hasUnread && !isActive && (
                                        <div className="absolute top-1 right-2 w-1 h-1 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                    ))}
                                </button>
                            );
                        })}
                    </div>
                    {isMobile && (
                        <button onClick={onToggle} className={`ml-4 w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 border ${theme === 'light' ? 'bg-white/40 text-black/30 hover:text-black border-black/5' : 'bg-white/5 text-white/40 hover:text-white border-white/5'}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className={`flex-1 flex items-center backdrop-blur-md p-1 h-9 rounded-[18px] border transition-colors ${theme === 'light' ? 'bg-white/40 border-black/5' : 'bg-[#1a1a1a]/50 border-white/5'}`}>
                        {['CHAT', 'IMAGES'].map(tab => (
                            <button key={tab} onClick={() => setActiveSubTab(tab as SubTabType)}
                                className={`flex-1 h-7 rounded-[14px] text-[12px] font-normal tracking-tight transition-all duration-500 uppercase flex items-center justify-center relative
                                    ${activeSubTab === tab ? (theme === 'light' ? 'text-gray-900 bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.1)]' : 'text-white bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.4)]') : (theme === 'light' ? 'text-black/30 hover:text-black/60' : 'text-white/40 hover:text-white/60')}`}>
                                <span className="relative z-20">{tab === 'CHAT' ? '动态' : '照片'}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={onOpenSettings}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border shrink-0 ${theme === 'light' ? 'text-black/20 hover:text-black/60 hover:bg-black/5 border-black/5 bg-white/40' : 'text-white/35 hover:text-white/70 hover:bg-white/5 border-white/5 bg-white/5'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>

                <div className="flex items-center gap-2 group cursor-default px-1 h-3">
                    <div className="w-1 h-1 rounded-full bg-[#818cf8] shadow-[0_0_8px_#818cf8]" />
                    <span className={`text-[9px] uppercase font-normal tracking-[0.2em] transition-colors ${theme === 'light' ? 'text-black/40 group-hover:text-black/60' : 'text-white/50 group-hover:text-white/70'}`}>{locationName || 'BROADCAST_READY'}</span>
                    {onlineCounts && onlineCounts[scale] > 0 && (
                        <div className="flex items-center gap-2 ml-4">
                            <div className="w-1 h-1 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                            <span className={`text-[11px] font-bold tracking-wider ${theme === 'light' ? 'text-black/30' : 'text-white/30'}`}>当前在线人数：<span className="text-green-400">{onlineCounts[scale]}</span></span>
                        </div>
                    )}
                </div>
            </div>

            <div
                className="flex-1 min-h-0 overflow-y-auto px-6 py-2 scrollbar-hide relative overscroll-contain touch-pan-y"
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                    maskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0) 2px, rgba(0,0,0,0.1) 6px, rgba(0,0,0,0.4) 12px, black 24px)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0) 2px, rgba(0,0,0,0.1) 6px, rgba(0,0,0,0.4) 12px, black 24px)',
                    WebkitOverflowScrolling: 'touch'
                }}
            >
                {activeSubTab === 'CHAT' && (
                    <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                        {hasMore && (
                            <div className="flex justify-center py-4">
                                {isLoadingMore ? (
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                ) : (
                                    <span className="text-[12px] font-normal text-white/20 uppercase tracking-tight">
                                        继续滑动加载更多历史消息
                                    </span>
                                )}
                            </div>
                        )}
                        {!hasMore && messages.length > 0 && (
                            <div className="flex justify-center py-4">
                                <span className="text-[12px] font-normal text-white/10 uppercase tracking-tight">
                                    没有更多历史消息了
                                </span>
                            </div>
                        )}

                        {virtualizer.getVirtualItems().map((virtualRow) => {
                            const index = virtualRow.index;
                            const msg = messages[index];
                            const isOwn = msg.userId === user.id;
                            const prevMsg = index > 0 ? messages[index - 1] : null;
                            const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

                            const isFirstInGroup = !prevMsg || prevMsg.userId !== msg.userId || (msg.timestamp - prevMsg.timestamp > 5 * 60 * 1000);
                            const isLastInGroup = !nextMsg || nextMsg.userId !== msg.userId || (nextMsg.timestamp - msg.timestamp > 5 * 60 * 1000);

                            const isVoice = msg.type === 'voice';
                            const isImg = msg.type === 'image';

                            if (msg.isRecalled) {
                                return (
                                    <div
                                        key={virtualRow.key}
                                        data-index={index}
                                        ref={virtualizer.measureElement}
                                        className="absolute left-0 right-0 px-6 flex justify-center my-1"
                                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                                    >
                                        <span className={`text-[12px] bg-black/5 ${theme === 'light' ? 'text-black/50' : 'text-white/40'} px-3 py-1 rounded-full flex items-center gap-1.5`}>
                                            <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            {isOwn ? '你撤回了一条消息' : `${msg.userName} 撤回了一条消息`}
                                        </span>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={virtualRow.key}
                                    data-index={index}
                                    ref={virtualizer.measureElement}
                                    className={`absolute left-0 right-0 px-6 flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'pt-3' : 'pt-1'}`}
                                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                                >
                                    {isFirstInGroup && (
                                        <div className={`mb-1 px-1 text-[11px] font-normal uppercase tracking-tighter flex items-center gap-1.5 ${isOwn ? (theme === 'light' ? 'text-black/60' : 'text-white/55') : (theme === 'light' ? 'text-black/50' : 'text-white/40')}`}>
                                            <span
                                                className={`cursor-pointer transition-opacity hover:opacity-70 ${msg.isGM ? 'text-rainbow-scroll scale-110 origin-left inline-block' : ''}`}
                                                onClick={() => {
                                                    const mention = `@${msg.userName} `;
                                                    if (!inputText.includes(mention)) {
                                                        setInputText(prev => prev + mention);
                                                        inputRef.current?.focus();
                                                    }
                                                }}
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
                                                onClick={(e) => activeMenuId ? setActiveMenuId(null) : openViewer(msg.content)}
                                                onContextMenu={(e) => { e.preventDefault(); handleMessageClick(msg, e); }}
                                                onPointerDown={(e) => {
                                                    const timer = setTimeout(() => handleMessageClick(msg, e as any), 600);
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
                                                    if (activeMenuId) return setActiveMenuId(null);
                                                    if (isVoice) playVoice(msg.content);
                                                }}
                                                onContextMenu={(e) => { e.preventDefault(); handleMessageClick(msg, e); }}
                                                onPointerDown={(e) => {
                                                    const timer = setTimeout(() => handleMessageClick(msg, e as any), 600);
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

                                        {activeMenuId === msg.id && (
                                            <div className={`absolute -top-10 ${isOwn ? 'right-0' : 'left-0'} z-50 flex gap-2 animate-in zoom-in-95 fade-in duration-200`}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        let content = msg.content;
                                                        if (msg.type === 'voice') content = '[语音]';
                                                        if (msg.type === 'image') content = '[图片]';
                                                        setQuotedMessage({ userName: msg.userName, content });
                                                        setActiveMenuId(null);
                                                        setInputMode('text');
                                                        setTimeout(() => inputRef.current?.focus(), 50);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl ${theme === 'light' ? 'bg-white/90 text-black' : 'bg-black/90 text-white'}`}
                                                >
                                                    引用
                                                </button>
                                                {isOwn && (Date.now() - msg.timestamp < 30 * 60 * 1000) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onRecallMessage(msg.id);
                                                            setActiveMenuId(null);
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
                                                                if (newName && onUpdateAnyUserName) onUpdateAnyUserName(msg.userId, newName);
                                                                setActiveMenuId(null);
                                                            }}
                                                            className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl bg-amber-500/90 text-white`}
                                                        >
                                                            改名
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (confirm('确定要永久抹除这条记录吗？') && onDeleteMessage) onDeleteMessage(msg.id);
                                                                setActiveMenuId(null);
                                                            }}
                                                            className={`px-3 py-1.5 rounded-xl backdrop-blur-3xl border border-white/20 text-[11px] font-normal tracking-tight uppercase transition-all active:scale-95 shadow-2xl bg-red-500/90 text-white`}
                                                        >
                                                            抹除
                                                        </button>
                                                        {!isOwn && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onRecallMessage(msg.id);
                                                                    setActiveMenuId(null);
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
                            );
                        })}
                    </div>
                )}

                {activeSubTab === 'IMAGES' && (
                    <div className="grid grid-cols-3 gap-2 pb-8 animate-in fade-in duration-700">
                        {galleryImages.map((msg, i) => (
                            <img key={msg.id} src={msg.url} loading="lazy" onClick={() => setViewerIndex(i)} className="w-full aspect-square object-cover rounded-[16px] cursor-zoom-in border border-white/5 hover:border-white/20 hover:scale-[1.02] transition-all duration-500 shadow-xl" alt="Gallery" />
                        ))}
                    </div>
                )}
                <div className="h-6" />
            </div>

            {showNewMessageTip && activeSubTab === 'CHAT' && (
                <div className="absolute bottom-16 left-0 right-0 z-[60] flex justify-center pointer-events-none animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <button
                        onClick={() => scrollToBottom('smooth')}
                        className={`pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-2xl border shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all active:scale-95 ${theme === 'light' ? 'bg-white/90 border-black/5 text-black' : 'bg-black/80 border-white/10 text-white'}`}
                    >
                        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                        <span className="text-[11px] font-normal tracking-tight uppercase">有新信息</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7-7-7" />
                        </svg>
                    </button>
                </div>
            )}

            {activeSubTab === 'CHAT' && (
                <div className={`shrink-0 z-20 ${isMobile ? 'px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'p-6 pt-1'}`}>
                    {typingUsers.length > 0 && (
                        <div className="px-4 flex items-center gap-2 mb-1.5 animate-in fade-in slide-in-from-bottom-1 duration-500">
                            <div className="flex gap-1 items-center py-1">
                                <div className="w-1 h-1 rounded-full bg-white/40" />
                                <div className="w-1 h-1 rounded-full bg-white/40" />
                                <div className="w-1 h-1 rounded-full bg-white/40" />
                            </div>
                            <span className={`text-[10px] font-normal uppercase tracking-tight ${theme === 'light' ? 'text-black/30' : 'text-white/30'}`}>
                                {typingUsers.length === 1 ? `${typingUsers[0]} 正在输入...` : '多人正在输入...'}
                            </span>
                        </div>
                    )}
                    {quotedMessage && (
                        <div className={`mb-2 p-2 rounded-xl backdrop-blur-xl border flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-300 ${theme === 'light' ? 'bg-black/5 border-black/5 text-black' : 'bg-white/5 border-white/10 text-white'}`}>
                            <div className="flex-1 min-w-0">
                                <div className={`text-[12px] font-normal uppercase tracking-tight mb-0.5 truncate ${theme === 'light' ? 'opacity-60' : 'opacity-40'}`}>引用 {quotedMessage.userName}</div>
                                <div className="text-[14px] opacity-80 truncate">{quotedMessage.content}</div>
                            </div>
                            <button onClick={() => setQuotedMessage(null)} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    )}
                    <div className={`backdrop-blur-md h-9 rounded-[18px] p-1 border shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center relative ${theme === 'light' ? 'bg-white/60 border-black/5' : 'bg-[#1a1a1a]/60 border-white/10'}`}>
                        <button type="button" onClick={() => setInputMode(inputMode === 'text' ? 'voice' : 'text')} className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 ${inputMode === 'voice' ? 'bg-white text-black shadow-lg scale-105' : (theme === 'light' ? 'bg-black/5 text-black/40 hover:text-black/60 hover:bg-black/10' : 'bg-white/5 text-white/50 hover:text-white/70 hover:bg-white/10')}`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>

                        {inputMode === 'text' && (
                            <div className="relative flex items-center h-7 px-1">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${showEmojiPicker ? 'bg-white/20' : 'hover:bg-white/5'} text-lg`}
                                >
                                    😀
                                </button>

                                {showEmojiPicker && (
                                    <div
                                        className={`absolute bottom-[calc(100%+12px)] left-0 z-50 p-2.5 rounded-[24px] backdrop-blur-3xl border border-white/10 shadow-2xl grid grid-cols-5 gap-1 w-48 animate-in fade-in slide-in-from-bottom-2 duration-200 ${theme === 'light' ? 'bg-white/95' : 'bg-[#1a1a1a]/95'}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {COMMON_EMOJIS.map(emoji => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => { setInputText(prev => prev + emoji); setShowEmojiPicker(false); inputRef.current?.focus(); }}
                                                className="w-8 h-8 flex items-center justify-center text-xl hover:scale-120 hover:bg-white/5 rounded-xl transition-all active:scale-90"
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                        <div className={`absolute bottom-[-5px] left-3 w-2.5 h-2.5 rotate-45 border-b border-r border-white/10 ${theme === 'light' ? 'bg-white/95' : 'bg-[#1a1a1a]/95'}`} />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={`flex-1 flex items-center h-7 overflow-hidden ${inputMode === 'text' ? 'mx-1' : 'ml-2'}`}>
                            {inputMode === 'text' ? (
                                <form onSubmit={handleSend} className="flex-1 flex items-center gap-1.5 h-full">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 text-lg font-light ${theme === 'light' ? 'text-black/20 hover:text-black' : 'text-white/40 hover:text-white'}`}>+</button>
                                    <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const reply = quotedMessage; setQuotedMessage(null); onUploadImage(f, reply || undefined); } }} accept="image/*" className="hidden" />
                                    <div className="flex-1 relative flex items-center h-full min-w-0">
                                        <input
                                            type="text"
                                            ref={inputRef}
                                            value={inputText}
                                            onPaste={handlePaste}
                                            onChange={(e) => setInputText(e.target.value)}
                                            onFocus={() => {
                                                if (isMobile) {
                                                    setTimeout(() => scrollToBottom('smooth'), 100);
                                                }
                                            }}
                                            placeholder="..."
                                            className={`w-full bg-transparent text-base font-normal focus:outline-none pr-8 ${theme === 'light' ? 'text-black placeholder:text-black/15' : 'text-white placeholder:text-white/20'}`}
                                            disabled={isSending}
                                        />
                                        {inputText && (
                                            <button
                                                type="button"
                                                onClick={() => { setInputText(''); inputRef.current?.focus(); }}
                                                className={`absolute right-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${theme === 'light' ? 'bg-black/10 text-black hover:bg-black/20' : 'bg-white/20 text-white hover:bg-white/30'}`}
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </form>
                            ) : (
                                <button onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (e) { } startRecording(); }} onPointerUp={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { } stopRecording(); }} onPointerCancel={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { } stopRecording(); }} className={`flex-1 h-7 rounded-full font-normal tracking-[0.1em] text-[12px] uppercase transition-all select-none touch-none flex items-center justify-center ${isRecording ? 'bg-white text-black scale-[0.98]' : (theme === 'light' ? 'bg-black/5 text-black/20 hover:bg-black/10' : 'bg-white/5 text-white/40 hover:bg-white/10')}`}>
                                    {isRecording ? '松开发送' : '按住说话'}
                                </button>
                            )}
                        </div>
                        <button onClick={() => inputMode === 'text' && handleSend()} className={`rounded-full flex items-center justify-center transition-all bg-white text-black shrink-0 ${inputMode === 'text' ? 'w-7 h-7' : 'w-0 h-7 border-0 p-0 overflow-hidden'} ${inputMode === 'text' && inputText.trim() ? 'opacity-100 scale-100 active:scale-95 shadow-xl' : 'opacity-0 scale-50 pointer-events-none'}`}>
                            <svg className="w-4 h-4 translate-x-[0.5px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 12h15" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {viewerIndex !== null && typeof document !== 'undefined' && (
                <div className={`fixed inset-0 z-[99999] flex flex-col transition-all duration-500 backdrop-blur-3xl ${theme === 'light' ? 'bg-white/90' : 'bg-black/80'}`} onClick={() => setViewerIndex(null)}>
                    <div className="absolute top-6 right-6 z-[120] pointer-events-auto">
                        <button onClick={(e) => { e.stopPropagation(); setViewerIndex(null); }} className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-black/50 hover:bg-black/70 text-white border border-white/10 shadow-2xl backdrop-blur-md">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="flex-1 relative flex items-center justify-center p-4 md:p-12 overflow-hidden pointer-events-none">
                        <div className="relative flex items-center justify-center">
                            <img
                                src={galleryImages[viewerIndex].url}
                                className={`max-w-full max-h-full object-contain select-none pointer-events-auto ${theme === 'light' ? 'shadow-[0_0_100px_rgba(0,0,0,0.2)]' : 'shadow-[0_0_100px_rgba(0,0,0,0.8)]'}`}
                                alt="Viewer"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    <div className="p-6 pt-0 pb-12 md:pb-6 shrink-0 z-[110] flex justify-center pointer-events-none">
                        <div className="w-full max-w-[460px] flex items-center gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                            <button disabled={viewerIndex === 0} onClick={(e) => { e.stopPropagation(); setViewerIndex(prev => prev! - 1); }} className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-3xl border transition-all shadow-xl shrink-0 ${theme === 'light' ? 'bg-white/90 border-black/10 text-black' : 'bg-[#1a1a1a]/90 border-white/10 text-white'} ${viewerIndex === 0 ? 'opacity-0 pointer-events-none' : 'active:scale-95'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>

                            <div className={`flex-1 backdrop-blur-3xl h-9 rounded-[18px] px-4 border shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex items-center justify-between min-0 ${theme === 'light' ? 'bg-white/90 border-black/10' : 'bg-[#1a1a1a]/90 border-white/10'}`}>
                                <div className="flex items-center gap-3 min-0">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${theme === 'light' ? 'bg-black/60 shadow-[0_0_8px_rgba(0,0,0,0.3)]' : 'bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.5)]'}`} />
                                    <span className={`text-[13px] font-normal tracking-[0.1em] uppercase truncate ${theme === 'light' ? 'text-black/80' : 'text-white/80'}`}>{galleryImages[viewerIndex].author}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 ml-2">
                                    <span className={`text-[12px] font-normal tracking-[0.1em] tabular-nums whitespace-nowrap ${theme === 'light' ? 'text-black/50' : 'text-white/50'}`}>{formatTimeSimple(new Date(galleryImages[viewerIndex].timestamp))}</span>
                                    <div className={`w-px h-4 ${theme === 'light' ? 'bg-black/10' : 'bg-white/10'}`} />
                                    <span className={`text-[12px] font-normal tracking-[0.1em] whitespace-nowrap ${theme === 'light' ? 'text-black/40' : 'text-white/40'}`}>{viewerIndex + 1}/{galleryImages.length}</span>
                                </div>
                            </div>

                            <button disabled={viewerIndex === galleryImages.length - 1} onClick={(e) => { e.stopPropagation(); setViewerIndex(prev => prev! + 1); }} className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-3xl border transition-all shadow-xl shrink-0 ${theme === 'light' ? 'bg-white/90 border-black/10 text-black' : 'bg-[#1a1a1a]/90 border-white/10 text-white'} ${viewerIndex === galleryImages.length - 1 ? 'opacity-0 pointer-events-none' : 'active:scale-95'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
