'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ScaleLevel, Message, User, SubTabType, LiveStream, SharedImage } from '@/types';

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
    isMobile?: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    scale, roomId, messages, unreadCounts, user, onSendMessage, onUploadImage, onUploadVoice,
    fetchLiveStreams, fetchSharedImages, isOpen, onToggle, onTabChange, isMobile = false
}) => {
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<SubTabType>('CHAT');
    const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);

    // Image Viewer Interaction
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const recordingStartTimeRef = useRef<number>(0);
    const audioObjRef = useRef<HTMLAudioElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeColor = scale === ScaleLevel.DISTRICT ? '#22d3ee' : scale === ScaleLevel.CITY ? '#fbbf24' : '#818cf8';

    // Global image collection for lightbox
    // Global image collection for lightbox (Strictly exclude voice messages)
    const galleryItems = messages.filter(msg => {
        // 1. Trust the message type if available
        if (msg.type === 'voice') return false;
        if (msg.type === 'image') return true;

        // 2. Fallback: Check content URL for voice patterns vs image patterns
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
            // Initial direct scroll
            scroll();
            // Delayed backup scroll for safety during tab/scale transitions
            const timer = setTimeout(scroll, 100);
            return () => clearTimeout(timer);
        }
    }, [messages.length, isOpen, activeSubTab, scale, roomId]);

    const startRecording = async () => {
        if (isRecording) return;
        try {
            console.log('Voice: Requesting mic access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            console.log('Voice: Selected MimeType:', mimeType);
            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recordingStartTimeRef.current = Date.now();
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                console.log('Voice: Recorder stopped, chunks:', audioChunksRef.current.length);
                const duration = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                if (duration >= 1) {
                    setIsSending(true);
                    await onUploadVoice(audioBlob, duration);
                    setIsSending(false);
                } else {
                    console.warn('Voice: Message too short');
                }
                setRecordingTime(0);
                stream.getTracks().forEach(track => track.stop());
            };
            recorder.start();
            setIsRecording(true);
            console.log('Voice: Recording started');
            timerRef.current = setInterval(() => {
                setRecordingTime(Math.round((Date.now() - recordingStartTimeRef.current) / 1000));
            }, 1000);
        } catch (err) {
            console.error("Voice: Mic Permission Denied or Error:", err);
            alert("Mic Permission Denied.");
        }
    };

    const stopRecording = () => {
        console.log('Voice: Attempting to stop recording...');
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        } else {
            console.warn('Voice: Recorder was not in recording state:', mediaRecorderRef.current?.state);
        }
        if (isRecording) setIsRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim() || isSending) return;
        setIsSending(true);
        try {
            await onSendMessage(inputText);
            setInputText('');
        } finally {
            setIsSending(false);
            // Small delay to ensure React has re-enabled the input before focusing
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    };

    const playVoice = (url: string) => {
        if (playingAudioUrl === url) { audioObjRef.current?.pause(); setPlayingAudioUrl(null); return; }
        if (audioObjRef.current) audioObjRef.current.pause();
        const audio = new Audio(url);
        audioObjRef.current = audio;
        setPlayingAudioUrl(url);
        audio.onended = () => setPlayingAudioUrl(null);
        audio.play().catch(() => setPlayingAudioUrl(null));
    };

    const isImageUrl = (url: string) => {
        const lower = url.toLowerCase();
        // Explicitly exclude voice message patterns
        if (lower.includes('voice_messages') || lower.includes('_voice.') || lower.includes('.webm') || lower.includes('.mp4')) return false;

        return lower.startsWith('blob:') || (lower.startsWith('http') && (
            lower.includes('.jpg') || lower.includes('.png') || lower.includes('.jpeg') ||
            lower.includes('.webp') || (lower.includes('supabase') && lower.includes('chat_images'))
        ));
    };
    const isVoiceUrl = (url: string) => url.includes('voice_messages') || url.includes('.webm') || url.includes('.mp4');

    const openViewer = (url: string) => {
        const index = galleryItems.findIndex(item => item.content === url);
        if (index !== -1) setViewerIndex(index);
    };

    return (
        <div className={`flex flex-col h-full w-full overflow-hidden transition-all duration-700 relative crystal-black-outer rounded-[40px] container-rainbow-main`} style={{ transform: 'translateZ(0)' }}>

            {/* Atmosphere background subtle layers */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-black/20" />
            </div>

            {/* Header Content */}
            <div className="shrink-0 p-6 pb-2 z-20 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex-1 flex bg-[#1a1a1a]/80 backdrop-blur-3xl p-1 rounded-[24px] border border-white/5">
                        {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
                            const isActive = scale === tab.value;
                            const hasUnread = unreadCounts[tab.value] > 0;
                            return (
                                <button key={tab.value} onClick={() => onTabChange(tab.value)}
                                    className={`flex-1 py-2.5 rounded-[20px] text-[11px] font-black tracking-widest transition-all duration-500 uppercase flex items-center justify-center relative
                                        ${isActive ? 'text-white bg-[#333333] shadow-[0_4px_20px_rgba(0,0,0,0.4)]' : 'text-white/20 hover:text-white/40'}`}>
                                    {tab.label}
                                    {hasUnread && !isActive && (
                                        <div className="absolute top-2 right-4 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {isMobile && (
                        <button onClick={onToggle} className="ml-4 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all shrink-0 border border-white/5">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                    )}
                </div>

                <div className="flex bg-[#1a1a1a]/80 backdrop-blur-3xl p-1 rounded-[24px] border border-white/5">
                    {['CHAT', 'IMAGES'].map(tab => (
                        <button key={tab} onClick={() => setActiveSubTab(tab as SubTabType)}
                            className={`flex-1 py-2.5 rounded-[20px] text-[11px] font-black tracking-widest transition-all duration-500 uppercase flex items-center justify-center
                                ${activeSubTab === tab ? 'text-white bg-[#333333] shadow-[0_4px_20px_rgba(0,0,0,0.4)]' : 'text-white/20 hover:text-white/40'}`}>
                            {tab === 'CHAT' ? '动态' : '相册'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#818cf8', boxShadow: '0 0 10px #818cf8' }} />
                    <span className="text-[10px] uppercase font-black tracking-[0.2em] text-white/20">空间广播系统就绪</span>
                </div>
            </div>

            {/* Main Content Pane */}
            <div className="flex-1 overflow-y-auto px-6 py-2 scrollbar-hide relative" ref={scrollRef}>
                {activeSubTab === 'CHAT' && (
                    <div className="flex flex-col gap-6">
                        {messages.map((msg) => {
                            const isOwn = msg.userId === user.id;
                            const isPlaying = playingAudioUrl === msg.content;
                            const isVoice = msg.type === 'voice' || isVoiceUrl(msg.content);
                            const isImg = msg.type === 'image' || (isImageUrl(msg.content) && !isVoice);
                            return (
                                <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-700`}>
                                    <div className={`mb-1.5 px-1 text-[10px] font-black uppercase tracking-widest ${isOwn ? 'text-white/40' : 'text-white/20'}`}>
                                        {msg.userName || `NODE_${msg.userId.substring(0, 4)}`}
                                    </div>

                                    {isImg ? (
                                        <div className={`relative group cursor-zoom-in rounded-[24px] overflow-hidden border border-white/5 hover:border-white/20 transition-all shadow-2xl ${isOwn ? 'bubble-rainbow p-1' : 'bg-white/5 p-1'}`}>
                                            <img src={msg.content} className="max-w-[220px] max-h-[300px] object-cover rounded-[20px]" onClick={() => openViewer(msg.content)} alt="Shared" />
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => isVoice && playVoice(msg.content)}
                                            className={`relative px-5 py-3 rounded-[20px] transition-all duration-500 max-w-[85%] shadow-xl cursor-pointer active:scale-[0.98]
                                            ${isOwn ? 'bubble-rainbow text-white' : 'bg-[#1a1a1a]/60 backdrop-blur-2xl text-white/90 border border-white/5'}`}
                                        >
                                            {isVoice ? (
                                                <div className="flex items-center gap-3 py-1 min-w-[120px]">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all bg-white/10 text-white/80 ${isPlaying ? 'bg-white text-black' : ''}`}>
                                                        {isPlaying ? '||' : '>'}
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-[9px] font-black opacity-30 uppercase tracking-[0.2em]">VOICE_SYST</span>
                                                        {isPlaying && <div className="h-1 w-12 bg-white/20 rounded-full overflow-hidden self-start"><div className="h-full bg-white/60 animate-[progress_2s_linear_infinite]" style={{ width: '40%' }} /></div>}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[14px] font-bold leading-relaxed tracking-tight">{msg.content}</span>
                                            )}
                                        </div>
                                    )}

                                    <span className="mt-1.5 px-1 text-[8px] font-black text-white/10 font-mono tracking-widest uppercase">
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeSubTab === 'IMAGES' && (
                    <div className="grid grid-cols-2 gap-3 pb-8 animate-in fade-in duration-700">
                        {galleryItems.map((msg, i) => (
                            <img key={msg.id} src={msg.content} onClick={() => setViewerIndex(i)} className="w-full aspect-[4/5] object-cover rounded-[20px] cursor-zoom-in border border-white/5 hover:border-white/20 hover:scale-[1.02] transition-all duration-500 shadow-xl" alt="Gallery" />
                        ))}
                    </div>
                )}
                <div className="h-6" />
            </div>

            {/* Input Capsule Area */}
            {activeSubTab === 'CHAT' && (
                <div className="p-6 pt-2 shrink-0 z-20">
                    <div className="bg-[#1a1a1a]/90 backdrop-blur-3xl rounded-[32px] p-2 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-3">
                        <button
                            onClick={() => setInputMode(inputMode === 'text' ? 'voice' : 'text')}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 text-[10px] font-black tracking-widest
                                ${inputMode === 'voice' ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
                        >
                            MIC
                        </button>

                        {inputMode === 'text' ? (
                            <form onSubmit={handleSend} className="flex-1 flex items-center gap-2">
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full flex items-center justify-center text-white/20 hover:text-white transition-all shrink-0 text-2xl font-light">+</button>
                                <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); }} accept="image/*" className="hidden" />
                                <input
                                    type="text"
                                    ref={inputRef}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="..."
                                    className="flex-1 min-w-0 bg-transparent py-2 text-[14px] font-bold text-white focus:outline-none placeholder:text-white/5"
                                    disabled={isSending}
                                    autoFocus
                                />
                                <button type="submit" disabled={!inputText.trim() || isSending} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all bg-white text-black shrink-0 ${!inputText.trim() ? 'opacity-0 scale-50 pointer-events-none' : 'opacity-100 scale-100 active:scale-95 shadow-xl font-black text-[9px]'}`}>SEND</button>
                            </form>
                        ) : (
                            <button
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (e) { }
                                    startRecording();
                                }}
                                onPointerUp={(e) => {
                                    e.preventDefault();
                                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { }
                                    stopRecording();
                                }}
                                onPointerCancel={(e) => {
                                    e.preventDefault();
                                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (e) { }
                                    stopRecording();
                                }}
                                className={`flex-1 h-12 rounded-full font-black tracking-[0.3em] text-[10px] uppercase transition-all select-none touch-none
                                    ${isRecording ? 'bg-white text-black animate-pulse scale-[0.98]' : 'bg-white/5 text-white/20 hover:bg-white/10'}`}
                            >
                                {isRecording ? 'RELEASE TO SEND' : 'HOLD TO BROADCAST'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Portal to Body for True Full-Screen View */}
            {viewerIndex !== null && typeof document !== 'undefined' && require('react-dom').createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-0 transition-all duration-500">
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setViewerIndex(null)} />

                    <div className="relative w-full h-full flex flex-col items-center justify-center pointer-events-none">
                        {/* Minimalist Close Button */}
                        <button
                            onClick={() => setViewerIndex(null)}
                            className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white text-white/60 hover:text-black flex items-center justify-center transition-all z-50 pointer-events-auto border border-white/10 shadow-2xl"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>

                        <div className="relative flex flex-col items-center gap-6 pointer-events-auto group">
                            <div className="relative flex items-center justify-center">
                                {/* Navigation Arrows - High Contrast and Tight */}
                                <button
                                    disabled={viewerIndex === 0}
                                    onClick={(e) => { e.stopPropagation(); setViewerIndex(prev => prev! - 1); }}
                                    className={`absolute -left-8 md:-left-12 w-16 h-16 rounded-full flex items-center justify-center bg-white text-black transition-all z-50 shadow-[0_0_40px_rgba(255,255,255,0.4)] ${viewerIndex === 0 ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 active:scale-90 hover:scale-105'}`}
                                >
                                    <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                                </button>

                                <img
                                    src={galleryItems[viewerIndex].content}
                                    className="max-w-[80vw] max-h-[82vh] object-contain rounded-2xl shadow-[0_0_150px_rgba(0,0,0,0.9)] border border-white/10 select-none"
                                    alt="Viewer"
                                />

                                <button
                                    disabled={viewerIndex === galleryItems.length - 1}
                                    onClick={(e) => { e.stopPropagation(); setViewerIndex(prev => prev! + 1); }}
                                    className={`absolute -right-8 md:-right-12 w-16 h-16 rounded-full flex items-center justify-center bg-white text-black transition-all z-50 shadow-[0_0_40px_rgba(255,255,255,0.4)] ${viewerIndex === galleryItems.length - 1 ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 active:scale-90 hover:scale-105'}`}
                                >
                                    <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>

                            {/* Minimalist Metadata Row */}
                            <div className="flex items-center gap-6 px-8 py-3 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 shadow-2xl">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2 h-2 rounded-full bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                                    <span className="text-[11px] font-black tracking-[0.2em] text-white/70 uppercase">
                                        {galleryItems[viewerIndex].userName || `NODE_${galleryItems[viewerIndex].userId.substring(0, 4)}`}
                                    </span>
                                </div>
                                <div className="w-px h-4 bg-white/10" />
                                <span className="text-[10px] font-black tracking-[0.25em] text-white/40 tabular-nums">
                                    {new Date(galleryItems[viewerIndex].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <div className="w-px h-4 bg-white/10" />
                                <span className="text-[10px] font-black tracking-[0.2em] text-white/20">
                                    {viewerIndex + 1} / {galleryItems.length}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                .crystal-black-outer { background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(40px) saturate(160%); -webkit-backdrop-filter: blur(40px) saturate(160%); }
                .container-rainbow-main { position: relative; border: 1px solid rgba(255, 255, 255, 0.05); }
                .container-rainbow-main::after { content: ""; position: absolute; inset: 0; border-radius: 40px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0.8; z-index: 50; animation: rainbow-drift 6s linear infinite; }
                
                .bubble-rainbow { position: relative; background: rgba(255, 255, 255, 0.06); border-radius: 20px; }
                .bubble-rainbow::after { content: ""; position: absolute; inset: -1.5px; border-radius: 21.5px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0.8; animation: rainbow-drift 4s linear infinite; }
                
                @keyframes rainbow-drift { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};
