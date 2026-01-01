'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ScaleLevel, Message, User, SubTabType, LiveStream, SharedImage, ThemeType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getCountryNameCN } from '@/lib/spatialService';

interface ChatInterfaceProps {
    scale: ScaleLevel;
    roomId: string;
    messages: Message[];
    unreadCounts: Record<ScaleLevel, number>;
    user: User;
    onSendMessage: (content: string) => Promise<void>;
    onUploadImage: (file: File) => Promise<void>;
    onUploadVoice: (blob: Blob, duration: number) => Promise<void>;
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
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    scale, roomId, messages, unreadCounts, user, onSendMessage, onUploadImage, onUploadVoice,
    fetchLiveStreams, fetchSharedImages, isOpen, onToggle, onTabChange, onUpdateUser, onOpenSettings, isMobile = false, locationName, theme = 'dark'
}) => {
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<SubTabType>('CHAT');
    const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);

    const [viewerIndex, setViewerIndex] = useState<number | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const recordingStartTimeRef = useRef<number>(0);
    const audioObjRef = useRef<HTMLAudioElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const galleryItems = messages.filter(msg => {
        if (msg.type === 'voice') return false;
        if (msg.type === 'image') return true;
        const lower = msg.content.toLowerCase();
        const isVoice = lower.includes('voice_messages') || lower.includes('.webm') || lower.includes('.mp4') || lower.includes('.mp3');
        if (isVoice) return false;
        const isImage = lower.startsWith('blob:') || (lower.startsWith('http') && (
            lower.includes('.jpg') || lower.includes('.png') || lower.includes('.jpeg') ||
            lower.includes('.webp') || lower.includes('.gif') ||
            (lower.includes('supabase') && lower.includes('chat_images'))
        ));
        return isImage;
    });

    useEffect(() => {
        if (activeSubTab === 'CHAT' && scrollRef.current && isOpen) {
            const scroll = () => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
                }
            };
            scroll();
            const timer = setTimeout(scroll, 100);
            return () => clearTimeout(timer);
        }
    }, [messages.length, isOpen, activeSubTab, scale, roomId]);

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
                    await onUploadVoice(audioBlob, duration);
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
        e?.preventDefault();
        if (!inputText.trim() || isSending) return;
        setIsSending(true);
        const text = inputText;
        setInputText('');
        try {
            await onSendMessage(text);
        } finally {
            setIsSending(false);
            setTimeout(() => inputRef.current?.focus(), 10);
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

    const isImageUrl = (url: string) => {
        const lower = url.toLowerCase();
        if (lower.includes('voice_messages') || lower.includes('_voice.') || lower.includes('.webm') || lower.includes('.mp4')) return false;
        return lower.startsWith('blob:') || (lower.startsWith('http') && (
            lower.includes('.jpg') || lower.includes('.png') || lower.includes('.jpeg') ||
            lower.includes('.webp') || (lower.includes('supabase') && lower.includes('chat_images'))
        ));
    };

    const openViewer = (url: string) => {
        const idx = galleryItems.findIndex(item => item.content === url);
        if (idx !== -1) setViewerIndex(idx);
    };

    const formatTimeSimple = (date: Date) => {
        return formatDistanceToNow(date, { addSuffix: true, locale: zhCN }).replace('大约', '');
    };

    return (
        <div className={`flex flex-col h-full w-full overflow-hidden transition-all duration-700 relative crystal-black-outer rounded-[40px] container-rainbow-main shadow-[0_20px_50px_rgba(0,0,0,0.5)]`} style={{ transform: 'translateZ(0)' }}>
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-black/20" />
            </div>

            <div className="shrink-0 p-6 pb-2 z-20 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className={`flex-1 flex items-center backdrop-blur-md p-1 h-9 rounded-[18px] border transition-colors ${theme === 'light' ? 'bg-white/40 border-black/5' : 'bg-[#1a1a1a]/50 border-white/5'}`}>
                        {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
                            const isActive = scale === tab.value;
                            const hasUnread = unreadCounts[tab.value] > 0;
                            return (
                                <button key={tab.value} onClick={() => onTabChange(tab.value)}
                                    className={`flex-1 h-7 rounded-[14px] text-[10px] font-black tracking-widest transition-all duration-500 uppercase flex items-center justify-center relative
                                        ${isActive ? (theme === 'light' ? 'text-gray-900 bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.1)]' : 'text-white bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.4)]') : (theme === 'light' ? 'text-black/30 hover:text-black/60' : 'text-white/20 hover:text-white/40')}`}>
                                    <span className="relative z-20">{tab.label}</span>
                                    {hasUnread && !isActive && (
                                        <div className="absolute top-1 right-2 w-1 h-1 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {isMobile && (
                        <button onClick={onToggle} className={`ml-4 w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 border ${theme === 'light' ? 'bg-white/40 text-black/30 hover:text-black border-black/5' : 'bg-white/5 text-white/20 hover:text-white border-white/5'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                    )}
                </div>

                <div className={`flex items-center backdrop-blur-md p-1 h-9 rounded-[18px] border transition-colors ${theme === 'light' ? 'bg-white/40 border-black/5' : 'bg-[#1a1a1a]/50 border-white/5'}`}>
                    {['CHAT', 'IMAGES'].map(tab => (
                        <button key={tab} onClick={() => setActiveSubTab(tab as SubTabType)}
                            className={`flex-1 h-7 rounded-[14px] text-[10px] font-black tracking-widest transition-all duration-500 uppercase flex items-center justify-center relative
                                ${activeSubTab === tab ? (theme === 'light' ? 'text-gray-900 bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.1)]' : 'text-white bubble-rainbow shadow-[0_4px_20px_rgba(0,0,0,0.4)]') : (theme === 'light' ? 'text-black/30 hover:text-black/60' : 'text-white/20 hover:text-white/40')}`}>
                            <span className="relative z-20">{tab === 'CHAT' ? '动态' : '照片'}</span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 group cursor-default">
                        <div className="w-1 h-1 rounded-full bg-[#818cf8] shadow-[0_0_8px_#818cf8] animate-pulse" />
                        <span className={`text-[9px] uppercase font-black tracking-[0.2em] transition-colors uppercase ${theme === 'light' ? 'text-black/40 group-hover:text-black/60' : 'text-white/30 group-hover:text-white/50'}`}>{locationName || 'BROADCAST_READY'}</span>
                    </div>
                    <button
                        onClick={onOpenSettings}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${theme === 'light' ? 'text-black/20 hover:text-black/60 hover:bg-black/5' : 'text-white/10 hover:text-white/60 hover:bg-white/5'}`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>
            </div>

            <div
                className="flex-1 overflow-y-auto px-6 py-2 scrollbar-hide relative"
                ref={scrollRef}
                style={{
                    maskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0) 2px, rgba(0,0,0,0.1) 6px, rgba(0,0,0,0.4) 12px, black 24px)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0) 2px, rgba(0,0,0,0.1) 6px, rgba(0,0,0,0.4) 12px, black 24px)'
                }}
            >
                {activeSubTab === 'CHAT' && (
                    <div className="flex flex-col gap-3.5">
                        {messages.map((msg, index) => {
                            const isOwn = msg.userId === user.id;
                            const isPlaying = playingAudioUrl === msg.content;
                            const isVoice = msg.type === 'voice' || msg.content.includes('voice_messages');
                            const isImg = msg.type === 'image' || (isImageUrl(msg.content) && !isVoice);

                            const prevMsg = messages[index - 1];
                            const nextMsg = messages[index + 1];
                            const isFirstInGroup = !prevMsg || prevMsg.userId !== msg.userId;
                            const isLastInGroup = !nextMsg || nextMsg.userId !== msg.userId;

                            return (
                                <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-700`}>
                                    {isFirstInGroup && (
                                        <div className={`mb-0.5 px-1 text-[10px] font-black uppercase tracking-widest ${isOwn ? (theme === 'light' ? 'text-black/40' : 'text-white/40') : (theme === 'light' ? 'text-black/30' : 'text-white/20')}`}>
                                            {msg.userName || `NODE_${msg.userId.substring(0, 4)}`}
                                            {msg.countryCode && (
                                                <span className="ml-1 opacity-50 font-normal"> - {getCountryNameCN(msg.countryCode)}</span>
                                            )}
                                        </div>
                                    )}

                                    {isImg ? (
                                        <div className={`relative group cursor-zoom-in rounded-[20px] transition-all shadow-xl p-[1.5px] overflow-hidden ${isOwn ? 'bubble-rainbow' : (theme === 'light' ? 'bg-white/40 backdrop-blur-md border border-black/5 mx-[0.5px]' : 'bg-[#1a1a1a]/40 backdrop-blur-md border border-white/5 mx-[0.5px]')}`} onClick={() => openViewer(msg.content)}>
                                            <div className="rounded-[18.5px] overflow-hidden w-20 h-20 md:w-24 md:h-24">
                                                <img src={msg.content} className="w-full h-full object-cover block" alt="Thumbnail" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div onClick={() => isVoice && playVoice(msg.content)} className={`relative px-4 flex items-center justify-center min-h-[34px] rounded-[20px] transition-all duration-500 w-fit max-w-[85%] shadow-xl cursor-pointer active:scale-[0.98] ${isVoice ? 'justify-center min-w-[120px]' : ''} ${isOwn ? `bubble-rainbow ${theme === 'light' ? 'text-gray-900' : 'text-white'}` : (theme === 'light' ? 'bg-white/60 backdrop-blur-md text-black/90 border border-black/5' : 'bg-[#1a1a1a]/40 backdrop-blur-md text-white/90 border border-white/5')}`}>
                                            {isVoice ? (
                                                <div className="flex items-center justify-center gap-4 w-full">
                                                    <div className={`flex items-center justify-center transition-all shrink-0 ${isPlaying ? (theme === 'light' ? 'text-black' : 'text-white') : (theme === 'light' ? 'text-black/60' : 'text-white/80')}`}>
                                                        {isPlaying ? (
                                                            <div className="flex gap-[1.5px] items-center justify-center">
                                                                <div className="w-[2px] h-2.5 bg-current rounded-full" />
                                                                <div className="w-[2px] h-2.5 bg-current rounded-full" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-l-[7px] border-l-current border-b-[4px] border-b-transparent ml-[2px]" />
                                                        )}
                                                    </div>
                                                    <div className="flex items-end gap-[2px] h-3 opacity-60">
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
                                                            <div key={i} className={`w-[2px] rounded-full transition-all duration-300 ${isPlaying ? 'animate-wave-bounce' : ''} ${theme === 'light' ? 'bg-black' : 'bg-white'}`} style={{ height: isPlaying ? `${Math.random() * 80 + 20}%` : `${20 + (i % 4) * 20}%`, animationDelay: `${i * 0.05}s` }} />
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className={`text-[14px] font-normal leading-tight block py-2 whitespace-pre-wrap ${isOwn ? 'text-right' : 'text-left'}`}>{msg.content}</span>
                                            )}
                                        </div>
                                    )}
                                    {isLastInGroup && (
                                        <span className={`mt-0.5 px-1 text-[8px] font-black font-mono tracking-widest uppercase ${theme === 'light' ? 'text-black/40' : 'text-white/30'}`}>
                                            {formatTimeSimple(new Date(msg.timestamp))}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeSubTab === 'IMAGES' && (
                    <div className="grid grid-cols-3 gap-2 pb-8 animate-in fade-in duration-700">
                        {galleryItems.map((msg, i) => (
                            <img key={msg.id} src={msg.content} onClick={() => setViewerIndex(i)} className="w-full aspect-square object-cover rounded-[16px] cursor-zoom-in border border-white/5 hover:border-white/20 hover:scale-[1.02] transition-all duration-500 shadow-xl" alt="Gallery" />
                        ))}
                    </div>
                )}
                <div className="h-6" />
            </div>

            {
                activeSubTab === 'CHAT' && (
                    <div className="p-6 pt-2 shrink-0 z-20">
                        <div className={`backdrop-blur-md h-9 rounded-[18px] p-1 border shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center ${theme === 'light' ? 'bg-white/60 border-black/5' : 'bg-[#1a1a1a]/60 border-white/10'}`}>
                            <button type="button" onClick={() => setInputMode(inputMode === 'text' ? 'voice' : 'text')} className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 ${inputMode === 'voice' ? 'bg-white text-black shadow-lg scale-105' : (theme === 'light' ? 'bg-black/5 text-black/40 hover:text-black/60 hover:bg-black/10' : 'bg-white/5 text-white/40 hover:text-white/60 hover:bg-white/10')}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                            </button>
                            <div className="flex-1 flex items-center mx-2 h-7 overflow-hidden">
                                {inputMode === 'text' ? (
                                    <form onSubmit={handleSend} className="flex-1 flex items-center gap-1.5 h-full">
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 text-lg font-light ${theme === 'light' ? 'text-black/20 hover:text-black' : 'text-white/20 hover:text-white'}`}>+</button>
                                        <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); }} accept="image/*" className="hidden" />
                                        <input type="text" ref={inputRef} value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="..." className={`flex-1 min-w-0 bg-transparent text-[13px] font-bold focus:outline-none ${theme === 'light' ? 'text-black placeholder:text-black/5' : 'text-white placeholder:text-white/5'}`} disabled={isSending} autoFocus />
                                    </form>
                                ) : (
                                    <button onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (e) { } startRecording(); }} onPointerUp={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { } stopRecording(); }} onPointerCancel={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { } stopRecording(); }} className={`flex-1 h-7 rounded-full font-black tracking-[0.2em] text-[8px] uppercase transition-all select-none touch-none ${isRecording ? 'bg-white text-black animate-pulse scale-[0.98]' : (theme === 'light' ? 'bg-black/5 text-black/20 hover:bg-black/10' : 'bg-white/5 text-white/20 hover:bg-white/10')}`}>
                                        {isRecording ? 'RELEASE' : 'HOLD TO TALK'}
                                    </button>
                                )}
                            </div>
                            <button onClick={() => inputMode === 'text' && handleSend()} className={`w-7 h-7 rounded-full flex items-center justify-center transition-all bg-white text-black shrink-0 ${inputMode === 'text' && inputText.trim() ? 'opacity-100 scale-100 active:scale-95 shadow-xl' : 'opacity-0 scale-50 pointer-events-none'}`}>
                                <svg className="w-4 h-4 translate-x-[0.5px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 12h15" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Viewer Portal */}
            {
                viewerIndex !== null && typeof document !== 'undefined' && (
                    <div className="fixed inset-0 z-[99999] flex flex-col transition-all duration-500 bg-black/95 backdrop-blur-3xl" onClick={() => setViewerIndex(null)}>
                        <div className="absolute top-6 right-6 z-[120] pointer-events-auto">
                            <button onClick={(e) => { e.stopPropagation(); setViewerIndex(null); }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white text-white/60 hover:text-black flex items-center justify-center transition-all border border-white/10 shadow-2xl">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="flex-1 relative flex items-center justify-center p-4 md:p-12 overflow-hidden pointer-events-none">
                            <div className="relative w-full h-full flex items-center justify-center pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                                <img src={galleryItems[viewerIndex].content} className="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(0,0,0,0.8)] select-none" alt="Viewer" />
                            </div>
                        </div>

                        <div className="p-6 pt-0 pb-12 md:pb-6 shrink-0 z-[110] flex justify-center pointer-events-none">
                            <div className="w-full max-w-[460px] flex items-center gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                                <button disabled={viewerIndex === 0} onClick={(e) => { e.stopPropagation(); setViewerIndex(prev => prev! - 1); }} className={`w-9 h-9 rounded-full flex items-center justify-center bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white transition-all shadow-xl shrink-0 ${viewerIndex === 0 ? 'opacity-0 pointer-events-none' : 'active:scale-95 hover:bg-white hover:text-black'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>

                                <div className="flex-1 bg-[#1a1a1a]/90 backdrop-blur-3xl h-9 rounded-[18px] px-4 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between min-w-0">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-2 h-2 rounded-full bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.5)] shrink-0" />
                                        <span className="text-[11px] font-black tracking-[0.1em] text-white/80 uppercase truncate">{galleryItems[viewerIndex].userName}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                        <span className="text-[10px] font-black tracking-[0.1em] text-white/40 tabular-nums whitespace-nowrap">{formatTimeSimple(new Date(galleryItems[viewerIndex].timestamp))}</span>
                                        <div className="w-px h-4 bg-white/10" />
                                        <span className="text-[10px] font-black tracking-[0.1em] text-white/20 whitespace-nowrap">{viewerIndex + 1}/{galleryItems.length}</span>
                                    </div>
                                </div>

                                <button disabled={viewerIndex === galleryItems.length - 1} onClick={(e) => { e.stopPropagation(); setViewerIndex(prev => prev! + 1); }} className={`w-9 h-9 rounded-full flex items-center justify-center bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white transition-all shadow-xl shrink-0 ${viewerIndex === galleryItems.length - 1 ? 'opacity-0 pointer-events-none' : 'active:scale-95 hover:bg-white hover:text-black'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg></button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
