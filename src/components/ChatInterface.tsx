'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ScaleLevel, Message, User, SubTabType, LiveStream, SharedImage, ThemeType, UserPresence } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getCountryNameCN } from '@/lib/spatialService';
import { MessageItem } from './MessageItem';
import { formatTimeSimple } from '@/lib/utils';

interface ChatInterfaceProps {
    scale: ScaleLevel;
    roomId: string;
    messages: Message[];
    unreadCounts: Record<ScaleLevel, number>;
    user: User;
    onSendMessage: (content: string, replyTo?: Message['replyTo']) => Promise<void>;
    onUploadImages: (files: File[], replyTo?: Message['replyTo']) => Promise<void>;
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
    onRead?: (timestamp: number) => void;
    onlineUsers?: UserPresence[];
    currentUserId?: string;
    isImmersive?: boolean;
    // Climbing mode - for viewing messages from oldest to newest
    onLoadOldest?: (scale: ScaleLevel) => Promise<void>;
    onLoadNewer?: (scale: ScaleLevel) => Promise<void>;
    hasNewer?: boolean;
    onReloadLatest?: (scale: ScaleLevel) => Promise<void>;
}


const SCALE_OPTIONS_TRANS = { WORLD: '世界', CITY: '城市', DISTRICT: '地区' };
const COMMON_EMOJIS = ['😂', '😍', '🤔', '👍', '🔥', '✨', '🎉', '❤️', '🙌', '👀', '🚀', '👋', '😭', '😎', '💀', '💯', '🌈', '🍦', '⚡️', '😀'];

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    scale, roomId, messages, unreadCounts, user, onSendMessage, onUploadImages, onUploadVoice, onRecallMessage,
    fetchLiveStreams, fetchSharedImages, isOpen, onToggle, onTabChange, onUpdateUser, onOpenSettings, isMobile = false, locationName, theme = 'dark', onlineCounts,
    onLoadMore, hasMore = false, onDeleteMessage, onUpdateAnyUserName, fontSize = 16,
    mentionCounts = { [ScaleLevel.DISTRICT]: 0, [ScaleLevel.CITY]: 0, [ScaleLevel.WORLD]: 0 },
    onTyping, typingUsers = [], onRead, onlineUsers = [], currentUserId, isImmersive = false,
    onLoadOldest, onLoadNewer, hasNewer = true, onReloadLatest
}) => {
    // Cumulative read status map: userId -> maxReadTimestamp
    const [readStatusMap, setReadStatusMap] = useState<Record<string, number>>({});

    // Reset cumulative map when switching channels/scales
    useEffect(() => {
        setReadStatusMap({});
    }, [scale]);

    // Update cumulative map based on onlineUsers
    useEffect(() => {
        if (!onlineUsers.length) return;
        setReadStatusMap(prev => {
            const next = { ...prev };
            let changed = false;
            onlineUsers.forEach(u => {
                if (u.lastReadTimestamp && u.lastReadTimestamp > (next[u.user_id] || 0)) {
                    next[u.user_id] = u.lastReadTimestamp;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [onlineUsers, scale]);

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
    const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

    // Climbing mode state - view messages from oldest to newest
    const [isClimbingMode, setIsClimbingMode] = useState(false);
    const [showClimbingPrompt, setShowClimbingPrompt] = useState(false);
    const loadMoreCountRef = useRef(0); // Track consecutive load more triggers

    useEffect(() => {
        const saved = localStorage.getItem('whisper_recent_emojis');
        if (saved) {
            try {
                setRecentEmojis(JSON.parse(saved));
            } catch { }
        }
    }, []);

    const handleEmojiClick = (emoji: string) => {
        setInputText(prev => prev + emoji);
        inputRef.current?.focus();

        setRecentEmojis(prev => {
            const next = [emoji, ...prev.filter(e => e !== emoji)].slice(0, 5);
            localStorage.setItem('whisper_recent_emojis', JSON.stringify(next));
            return next;
        });
    };

    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [galleryImages, setGalleryImages] = useState<SharedImage[]>([]);
    const [showControls, setShowControls] = useState(true);
    const viewerControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const viewerScaleRef = useRef(1);

    // Auto-hide climbing prompt after 2 seconds
    useEffect(() => {
        if (showClimbingPrompt) {
            const timer = setTimeout(() => {
                setShowClimbingPrompt(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [showClimbingPrompt]);

    // Reset controls visibility when viewer opens
    useEffect(() => {
        if (viewerIndex !== null) {
            setShowControls(true);
            resetControlsTimeout();
        } else {
            if (viewerControlsTimeoutRef.current) clearTimeout(viewerControlsTimeoutRef.current);
        }
    }, [viewerIndex]);

    const resetControlsTimeout = useCallback(() => {
        if (viewerControlsTimeoutRef.current) clearTimeout(viewerControlsTimeoutRef.current);
        setShowControls(true);
        viewerControlsTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);
    }, []);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isTypingRef = useRef(false);
    const recordingStartTimeRef = useRef<number>(0);
    const audioObjRef = useRef<HTMLAudioElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const isAutoScrolling = useRef<boolean>(false);
    const lastMessageId = useRef<string | null>(null);
    const lastRoomId = useRef<string | null>(null);
    const lastSubTab = useRef<SubTabType>('CHAT');
    const isPressedRef = useRef(false);

    const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior });
            setShowNewMessageTip(false);
        }
    };

    const fetchSharedImagesRef = useRef(fetchSharedImages);
    useEffect(() => { fetchSharedImagesRef.current = fetchSharedImages; });

    useEffect(() => {
        if (activeSubTab === 'IMAGES' && roomId) {
            fetchSharedImagesRef.current(roomId).then(setGalleryImages);
        } else if (roomId !== lastRoomId.current) {
            setGalleryImages([]);
        }
    }, [activeSubTab, roomId]);

    useEffect(() => {
        const chatImages = messages
            .filter(m => !m.isRecalled)
            .flatMap(m => {
                if (m.type === 'image' || m.content.includes('chat_images')) {
                    const urls = m.content.split(',');
                    return urls.map((url, idx) => ({
                        id: urls.length > 1 ? `${m.id}_${idx}` : m.id,
                        url: url,
                        caption: '',
                        author: m.userName,
                        likes: 0,
                        lat: 0,
                        lng: 0,
                        timestamp: m.timestamp
                    }));
                }
                return [];
            });

        setGalleryImages(prev => {
            // 1. Identify all messages that are currently marked as recalled
            const recalledIds = new Set(messages.filter(m => m.isRecalled).map(m => m.id));

            // 2. Filter out any images whose source message ID matches a recalled one
            const filteredPrev = prev.filter(img => {
                const baseId = img.id.split('_')[0];
                return !recalledIds.has(baseId);
            });

            // 3. Add only new images that aren't already in the gallery
            const existingIds = new Set(filteredPrev.map(img => img.id));
            const newImages = chatImages.filter(img => !existingIds.has(img.id));

            if (newImages.length === 0 && filteredPrev.length === prev.length) return prev;

            // Sort by timestamp ascending (Oldest to Newest)
            // Top-left will be the oldest image
            return [...filteredPrev, ...newImages].sort((a, b) => a.timestamp - b.timestamp);
        });
    }, [messages]);

    useEffect(() => {
        // In climbing mode, ignore new messages and don't auto-scroll
        if (isClimbingMode) {
            return;
        }

        if (activeSubTab === 'CHAT' && scrollRef.current && isOpen) {
            const currentLastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const currentLastId = currentLastMsg?.id || null;

            const roomChanged = roomId !== lastRoomId.current;
            const subTabChangedToChat = activeSubTab === 'CHAT' && lastSubTab.current !== 'CHAT';
            const subTabChangedToImages = activeSubTab === 'IMAGES' && lastSubTab.current !== 'IMAGES';

            if (roomChanged || subTabChangedToChat || subTabChangedToImages) {
                lastMessageId.current = null;
                lastRoomId.current = roomId;
                lastSubTab.current = activeSubTab;
                requestAnimationFrame(() => scrollToBottom('auto'));
                return;
            }

            const isInitialLoad = lastMessageId.current === null && currentLastId !== null;
            const hasNewerMessage = currentLastId !== null && currentLastId !== lastMessageId.current;

            if (isInitialLoad) {
                requestAnimationFrame(() => scrollToBottom('auto'));
            } else if (hasNewerMessage) {
                const container = scrollRef.current;
                const isNearBottom = container ? Math.abs(container.scrollTop) < 250 : true;
                const lastMsgIsOwn = currentLastMsg?.userId === user.id;

                if (isNearBottom || isAutoScrolling.current || lastMsgIsOwn) {
                    scrollToBottom('smooth');
                    setShowNewMessageTip(false);
                } else {
                    setShowNewMessageTip(true);
                }
            }
            lastMessageId.current = currentLastId;
            lastSubTab.current = activeSubTab;
        } else {
            lastSubTab.current = activeSubTab;
        }
    }, [messages, isOpen, activeSubTab, scale, roomId, user.id, isClimbingMode]);

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

    useEffect(() => {
        if (activeSubTab === 'CHAT' && typingUsers.length > 0 && scrollRef.current) {
            const container = scrollRef.current;
            const isNearBottom = Math.abs(container.scrollTop) < 200;
            if (isNearBottom) {
                scrollToBottom('smooth');
            }
        }
    }, [typingUsers.length, activeSubTab]);

    useEffect(() => {
        if (!isMobile) return;
        const handleResize = () => {
            if (activeSubTab === 'CHAT' && inputRef.current && document.activeElement === inputRef.current) {
                // Only scroll the message container, don't force scrollIntoView on the input
                // as it can cause blurs on Android Chrome.
                setTimeout(() => {
                    scrollToBottom('auto');
                }, 100);
            }
        };
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
        }
        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleResize);
            }
        };
    }, [isMobile, activeSubTab]);

    const lastPromptTimeRef = useRef(0);

    const handleScroll = useCallback(async () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const absScrollTop = Math.abs(scrollTop);

        // Normal mode: scrollTop=0 is bottom, negative scrollTop means scrolling up
        // Climbing mode: scrollTop=0 is top (oldest messages), positive scrollTop means scrolling down

        if (!isClimbingMode) {
            // Normal mode behavior
            // Hide prompt if user scrolls back down (away from top/history)
            if (absScrollTop < 200) {
                const elapsed = Date.now() - lastPromptTimeRef.current;
                if (elapsed < 2000) {
                    setTimeout(() => setShowClimbingPrompt(false), 2000 - elapsed);
                } else {
                    setShowClimbingPrompt(false);
                }

                setShowNewMessageTip(false);
                loadMoreCountRef.current = 0; // Reset counter when near bottom
                if (activeSubTab === 'CHAT' && onRead) {
                    onRead(Date.now());
                }
            } else if (absScrollTop < scrollHeight - clientHeight - 300) {
                // Also hide prompt if user is just scrolling in the middle, away from the trigger zone
                const elapsed = Date.now() - lastPromptTimeRef.current;
                if (elapsed < 2000) {
                    setTimeout(() => setShowClimbingPrompt(false), 2000 - elapsed);
                } else {
                    setShowClimbingPrompt(false);
                }
            }

            // Trigger load more when scrolling up (towards older messages)
            if (absScrollTop + clientHeight > scrollHeight - 100 && hasMore && !isLoadingMore && activeSubTab === 'CHAT') {
                setIsLoadingMore(true);
                loadMoreCountRef.current += 1;

                // Show climbing mode prompt after 1 load more trigger
                if (loadMoreCountRef.current >= 1 && onLoadOldest) {
                    // Only show if we are significantly up the list (not near bottom)
                    // This prevents showing it for short content that fits in one screen
                    if (absScrollTop > 200) {
                        setShowClimbingPrompt(true);
                        lastPromptTimeRef.current = Date.now();
                    }
                }

                if (onLoadMore) {
                    await onLoadMore(scale);
                }
                setIsLoadingMore(false);
            }
        } else {
            // Climbing mode behavior - messages are displayed oldest first
            // In this mode, scrolling down loads newer messages
            if (scrollTop + clientHeight > scrollHeight - 100 && hasNewer && !isLoadingMore && activeSubTab === 'CHAT') {
                setIsLoadingMore(true);
                if (onLoadNewer) {
                    await onLoadNewer(scale);
                }
                setIsLoadingMore(false);
            }
        }
    }, [hasMore, hasNewer, isLoadingMore, activeSubTab, onLoadMore, onLoadNewer, scale, onRead, isClimbingMode, onLoadOldest]);

    const startRecording = async () => {
        if (isRecording) return;
        isPressedRef.current = true;
        const startTime = Date.now();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Detect if a permission prompt was shown (usually > 500ms)
            // or if the user has already released the button
            const elapsed = Date.now() - startTime;
            if (elapsed > 500 || !isPressedRef.current) {
                stream.getTracks().forEach(t => t.stop());
                isPressedRef.current = false;
                return;
            }

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
            isPressedRef.current = false;
        }
    };

    const stopRecording = () => {
        isPressedRef.current = false;
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        setIsRecording(false);
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
        const files = e.clipboardData.files;
        if (files.length > 0) {
            const photos = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 9);
            if (photos.length > 0) {
                onUploadImages(photos);
                e.preventDefault();
            }
        }
    };

    const playVoice = useCallback((url: string) => {
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
    }, [playingAudioUrl]);

    const openViewer = useCallback((url: string) => {
        const idx = galleryImages.findIndex(item => item.url === url);
        if (idx !== -1) {
            setViewerIndex(idx);
        } else {
            const msg = messages.find(m => m.content.includes(url));
            if (msg) {
                const urls = msg.content.split(',');
                const newImgs: SharedImage[] = urls.map((u, i) => ({
                    id: `${msg.id}_${i}`,
                    url: u,
                    caption: '',
                    author: msg.userName,
                    likes: 0,
                    lat: 0,
                    lng: 0,
                    timestamp: msg.timestamp
                }));
                setGalleryImages(prev => [...newImgs, ...prev]);
                setViewerIndex(0);
            }
        }
    }, [galleryImages, messages]);

    const handleSetActiveMenu = useCallback((id: string) => setActiveMenuId(id), []);
    const handleUnsetActiveMenu = useCallback(() => setActiveMenuId(null), []);

    const handleQuote = useCallback((reply: { userName: string; content: string }) => {
        setQuotedMessage(reply);
        setActiveMenuId(null);
        setInputMode('text');
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    const handleAddMention = useCallback((name: string) => {
        const mention = `@${name} `;
        setInputText(prev => {
            if (!prev.includes(mention)) return prev + mention;
            return prev;
        });
        inputRef.current?.focus();
    }, []);

    const handleDeleteMessageWrapper = useCallback((id: string) => {
        if (onDeleteMessage) onDeleteMessage(id);
    }, [onDeleteMessage]);

    const handleUpdateNameWrapper = useCallback((userId: string, name: string) => {
        if (onUpdateAnyUserName) onUpdateAnyUserName(userId, name);
    }, [onUpdateAnyUserName]);

    // Climbing mode handlers
    const enterClimbingMode = useCallback(async () => {
        if (onLoadOldest) {
            setShowClimbingPrompt(false);
            setIsClimbingMode(true);
            await onLoadOldest(scale);
            // Scroll to top (oldest messages)
            if (scrollRef.current) {
                scrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
            }
        }
    }, [onLoadOldest, scale]);

    const exitClimbingMode = useCallback(() => {
        window.location.reload();
    }, []);

    const transformControlsRef = useRef<any>(null);
    const touchStartRef = useRef<{ x: number, y: number, time: number } | null>(null);
    const lastTapTimeRef = useRef<number>(0);
    const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            touchStartRef.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: Date.now()
            };
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;
        const touchEnd = {
            x: e.changedTouches[0].clientX,
            y: e.changedTouches[0].clientY,
            time: Date.now()
        };

        const diffX = touchEnd.x - touchStartRef.current.x;
        const diffY = touchEnd.y - touchStartRef.current.y;
        const diffTime = touchEnd.time - touchStartRef.current.time;

        const isTap = Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && diffTime < 300;

        // Swipe Detections (Only if scale is near 1)
        if (!isTap && Math.abs(diffX) > 50 && Math.abs(diffY) < 50 && Math.abs(viewerScaleRef.current - 1) < 0.1) {
            if (diffX > 0) {
                // Swipe Right -> Prev Image
                if (viewerIndex !== null && viewerIndex > 0) setViewerIndex(viewerIndex - 1);
            } else {
                // Swipe Left -> Next Image
                if (viewerIndex !== null && viewerIndex < galleryImages.length - 1) setViewerIndex(viewerIndex + 1);
            }
        }

        // Tap Handling
        if (isTap) {
            const now = Date.now();
            const timeSinceLastTap = now - lastTapTimeRef.current;

            if (timeSinceLastTap < 300) {
                // Double Tap Detected
                if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
                lastTapTimeRef.current = 0;
                // Let react-zoom-pan-pinch handle the zoom via its internal double tap listeners
                // or we can manually trigger if needed, but usually it works out of box.
                // We just prevent single tap action here.
            } else {
                // Potential Single Tap
                lastTapTimeRef.current = now;
                tapTimeoutRef.current = setTimeout(() => {
                    // Single Tap Action Triggered
                    if (showControls) {
                        // If controls are shown, SINGLE TAP CLOSES THE VIEWER (Per user request: "用手触碰一次图片后直接关闭图片")
                        setViewerIndex(null);
                    } else {
                        // If controls are hidden, show them
                        resetControlsTimeout();
                    }
                }, 300);
            }
        }

        touchStartRef.current = null;
    };

    // In climbing mode, messages are displayed in chronological order (oldest first)
    // In normal mode, messages are reversed (newest first at bottom with column-reverse)
    const displayMessages = useMemo(() => {
        if (isClimbingMode) {
            // Climbing mode: oldest first, no reverse needed
            return messages;
        } else {
            // Normal mode: reverse for column-reverse display
            return [...messages].reverse();
        }
    }, [messages, isClimbingMode]);

    // Pre-compute readCounts for all messages to avoid repeated calculations during render
    const readCountsMap = useMemo(() => {
        const map: Record<string, number> = {};
        const entries = Object.entries(readStatusMap);
        for (const msg of messages) {
            map[msg.id] = entries.filter(([uid, readTs]) => readTs >= msg.timestamp && uid !== msg.userId && uid !== currentUserId).length;
        }
        return map;
    }, [messages, readStatusMap, currentUserId]);

    return (
        <div
            className={`flex flex-col h-full w-full overflow-hidden transition-[background-color,box-shadow,border-radius] duration-700 relative crystal-black-outer ${isMobile && isImmersive ? 'rounded-none order-0' : (isMobile ? 'rounded-[32px]' : 'rounded-[40px]')} ${!isImmersive ? 'container-rainbow-main' : ''} ${theme === 'light' ? 'shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]' : 'shadow-[0_20px_50px_rgba(0,0,0,0.5)]'}`}
            style={{ transform: 'translateZ(0)', touchAction: isMobile ? 'pan-y' : 'auto' }}
            onTouchMove={(e) => { if (isMobile) e.stopPropagation(); }}
            onTouchStart={(e) => { if (isMobile) e.stopPropagation(); }}
        >
            <div className={`shrink-0 z-30 transition-all duration-500 ${isMobile ? 'p-3 pt-2 pb-1' : 'px-6 pt-3 pb-2'} flex flex-col gap-1.5`}>
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
                                        <div className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 px-0.5 rounded-full bg-red-500 border border-white/20 flex items-center justify-center text-[8px] text-white font-bold animate-pulse z-30">@</div>
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
                    <button onClick={onOpenSettings} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border shrink-0 ${theme === 'light' ? 'text-black/20 hover:text-black/60 hover:bg-black/5 border-black/5 bg-white/40' : 'text-white/35 hover:text-white/70 hover:bg-white/5 border-white/5 bg-white/5'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                </div>

                <div className="flex items-center gap-2 group cursor-default px-1 h-4 self-start scale-95 origin-left">
                    <div className="w-1 h-1 rounded-full bg-[#818cf8] shadow-[0_0_8px_#818cf8]" />
                    <span className={`text-[10px] font-normal tracking-wider transition-colors ${theme === 'light' ? 'text-black/40 group-hover:text-black/60' : 'text-white/50 group-hover:text-white/70'}`}>{locationName || 'BROADCAST_READY'}</span>
                    {onlineCounts && onlineCounts[scale] > 0 && (
                        <div className="flex items-center gap-2 ml-3">
                            <div className="w-1 h-1 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                            <span className={`text-[10px] font-normal tracking-wider ${theme === 'light' ? 'text-black/40' : 'text-white/50'}`}>当前在线人数：<span className="text-green-400 font-medium">{onlineCounts[scale]}</span></span>
                        </div>
                    )}
                </div>
            </div>

            <div className={`flex-1 min-h-0 overflow-y-auto px-2 py-2 scrollbar-hide relative overscroll-contain touch-pan-y ${isClimbingMode ? 'flex flex-col' : 'flex flex-col-reverse'}`} ref={scrollRef} onScroll={handleScroll} style={{ WebkitOverflowScrolling: 'touch', overflowAnchor: 'auto' }}>
                {activeSubTab === 'CHAT' && (
                    <div className={`relative ${isClimbingMode ? 'flex flex-col' : 'flex flex-col-reverse'}`}>
                        {displayMessages.map((msg: Message, displayIndex: number) => {
                            // Calculate correct index based on mode
                            const index = isClimbingMode ? displayIndex : messages.length - 1 - displayIndex;
                            const prevMsg = index > 0 ? messages[index - 1] : null;
                            const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                            return (
                                <MessageItem key={msg.id} msg={msg} prevMsg={prevMsg} nextMsg={nextMsg} user={user} theme={theme} isActiveMenu={activeMenuId === msg.id} playingAudioUrl={playingAudioUrl} fontSize={fontSize} index={index} onSetActiveMenu={handleSetActiveMenu} onUnsetActiveMenu={handleUnsetActiveMenu} onRecall={onRecallMessage} onDelete={handleDeleteMessageWrapper} onUpdateName={handleUpdateNameWrapper} onQuote={handleQuote} onPlayVoice={playVoice} onViewImage={openViewer} onAddMention={handleAddMention} readCount={readCountsMap[msg.id] || 0} />
                            );
                        })}
                        {/* Normal mode: show load more at top */}
                        {!isClimbingMode && hasMore && (
                            <div className="flex justify-center py-4 order-last">
                                {isLoadingMore ? <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /> : <span className="text-[12px] font-normal text-white/20 uppercase tracking-tight">继续滑动加载更多历史消息</span>}
                            </div>
                        )}
                        {!isClimbingMode && !hasMore && messages.length > 0 && (
                            <div className="flex justify-center py-4 order-last">
                                <span className="text-[12px] font-normal text-white/10 uppercase tracking-tight">没有更多历史消息了</span>
                            </div>
                        )}
                        {/* Climbing mode: show load newer at bottom */}
                        {isClimbingMode && hasNewer && (
                            <div className="flex justify-center py-4">
                                {isLoadingMore ? <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /> : <span className="text-[12px] font-normal text-white/20 uppercase tracking-tight">继续滑动加载更新消息</span>}
                            </div>
                        )}
                        {isClimbingMode && !hasNewer && messages.length > 0 && (
                            <div className="flex justify-center py-4">
                                <span className="text-[12px] font-normal text-white/10 uppercase tracking-tight">已到达最新消息</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Climbing mode prompt button - appears when user scrolls up multiple times */}
                {showClimbingPrompt && !isClimbingMode && (
                    <div className="fixed inset-x-0 top-28 flex justify-center z-50 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
                        <button
                            onClick={enterClimbingMode}
                            className={`pointer-events-auto px-4 py-2.5 rounded-full backdrop-blur-xl shadow-2xl flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${theme === 'light' ? 'bg-white/90 text-black border border-black/10' : 'bg-[#2a2a2a]/90 text-white border border-white/10'}`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" /></svg>
                            <span className="text-[13px] font-medium">开启爬楼模式</span>
                            <span className="text-[11px] opacity-60">从最早消息开始</span>
                        </button>
                    </div>
                )}

                {/* Climbing mode active indicator and exit button */}
                {isClimbingMode && (
                    <div className="fixed inset-x-0 bottom-32 flex justify-center z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-xl shadow-2xl ${theme === 'light' ? 'bg-amber-50/95 border border-amber-200' : 'bg-amber-900/80 border border-amber-600/50'}`}>
                            <div className="flex items-center gap-1.5">
                                <svg className={`w-4 h-4 ${theme === 'light' ? 'text-amber-600' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" /></svg>
                                <span className={`text-[12px] font-medium ${theme === 'light' ? 'text-amber-700' : 'text-amber-300'}`}>爬楼模式</span>
                            </div>
                            <button
                                onClick={exitClimbingMode}
                                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all hover:scale-105 active:scale-95 ${theme === 'light' ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-amber-500 text-black hover:bg-amber-400'}`}
                            >
                                返回最新
                            </button>
                        </div>
                    </div>
                )}
                {activeSubTab === 'IMAGES' && (
                    <div className="grid grid-cols-3 gap-2 pb-8 animate-in fade-in duration-700">
                        {[...galleryImages].sort((a, b) => a.timestamp - b.timestamp).map((img, i) => (
                            <div key={img.id} onClick={() => { setViewerIndex(i); }} className="aspect-square rounded-2xl overflow-hidden cursor-zoom-in group relative shadow-md">
                                <img src={img.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={`Shared Photo by ${img.author}`} loading="lazy" />
                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[9px] text-white/80 truncate block">{img.author}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={`shrink-0 z-30 transition-all duration-500 ${isMobile ? 'p-3 pb-safe' : 'px-6 pt-2 pb-3'}`}>
                {showEmojiPicker && (
                    <div className={`mb-3 p-3 rounded-[24px] border backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-300 shadow-2xl relative z-40 ${theme === 'light' ? 'bg-white/90 border-black/5' : 'bg-[#1a1a1a]/90 border-white/10'}`}>
                        {recentEmojis.length > 0 && (
                            <div className="mb-3 pb-2 border-b border-white/5">
                                <div className={`px-2 mb-2 text-[9px] uppercase tracking-[0.2em] font-bold ${theme === 'light' ? 'text-black/30' : 'text-white/20'}`}>最近使用</div>
                                <div className="grid grid-cols-5 gap-2">
                                    {recentEmojis.map(emoji => (
                                        <button
                                            key={`recent-${emoji}`}
                                            onClick={() => handleEmojiClick(emoji)}
                                            className={`w-10 h-10 flex items-center justify-center text-xl rounded-xl transition-all hover:scale-125 active:scale-90 ${theme === 'light' ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={`px-2 mb-2 text-[9px] uppercase tracking-[0.2em] font-bold ${theme === 'light' ? 'text-black/30' : 'text-white/20'}`}>所有表情</div>
                        <div className="grid grid-cols-5 gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-hide">
                            {COMMON_EMOJIS.map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => handleEmojiClick(emoji)}
                                    className={`w-10 h-10 flex items-center justify-center text-xl rounded-xl transition-all hover:scale-125 active:scale-90 ${theme === 'light' ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {quotedMessage && (
                    <div className={`mb-2 p-2 rounded-2xl flex items-center justify-between border backdrop-blur-3xl animate-in slide-in-from-bottom-2 duration-300 ${theme === 'light' ? 'bg-white/60 border-black/5 text-gray-800' : 'bg-[#1a1a1a]/60 border-white/10 text-white/80'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-1 h-4 rounded-full bg-blue-500/50" />
                            <div className="min-w-0">
                                <span className="text-[10px] font-medium opacity-50 block uppercase tracking-wider">{quotedMessage.userName}</span>
                                <span className="text-[12px] line-clamp-1 opacity-90 truncate">{quotedMessage.content}</span>
                            </div>
                        </div>
                        <button onClick={() => setQuotedMessage(null)} className="p-1 px-2 opacity-40 hover:opacity-100 transition-opacity"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                )}

                <div className={`flex items-end gap-2.5 ${isMobile ? '' : 'transition-all duration-500'}`}>
                    <div className={`flex-1 h-[48px] rounded-[24px] border flex items-center shadow-2xl relative ${isMobile ? '' : 'transition-all duration-500'} ${isRecording ? 'bg-red-500/10 border-red-500/30 ring-4 ring-red-500/5' : (theme === 'light' ? 'bg-white/70 border-black/5' : 'bg-[#1a1a1a]/60 border-white/10')}`}>
                        {inputMode === 'text' ? (
                            <div className="flex-1 flex items-center gap-0 h-full pl-2 pr-4">
                                <button type="button" onClick={() => fileInputRef.current?.click()} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${theme === 'light' ? 'text-black/20 hover:text-black' : 'text-white/40 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${theme === 'light' ? 'text-black/20 hover:text-black' : 'text-white/40 hover:text-white'}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </button>
                                <input type="file" ref={fileInputRef} onChange={(e) => { const files = Array.from(e.target.files || []).slice(0, 9); if (files.length > 0) { onUploadImages(files, quotedMessage || undefined); setQuotedMessage(null); } e.target.value = ''; }} accept="image/*" multiple className="hidden" />
                                <form onSubmit={handleSend} className="flex-1 h-full flex items-center relative">
                                    <input
                                        type="text"
                                        inputMode="text"
                                        ref={inputRef}
                                        value={inputText}
                                        onPaste={handlePaste}
                                        onChange={(e) => setInputText(e.target.value)}
                                        placeholder={isSending ? "正在传输..." : "发送消息..."}
                                        className={`w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 pr-8 text-[14px] font-normal ${theme === 'light' ? 'text-gray-900 placeholder:text-black/30' : 'text-white placeholder:text-white/20'}`}
                                        disabled={isSending}
                                    />
                                    {inputText.length > 0 && !isSending && (
                                        <button
                                            type="button"
                                            onClick={() => { setInputText(''); inputRef.current?.focus(); }}
                                            className={`absolute right-0 w-5 h-5 rounded-full flex items-center justify-center transition-all hover:scale-110 ${theme === 'light' ? 'bg-black/5 text-black/40 hover:bg-black/10' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </form>
                            </div>
                        ) : (
                            <button
                                onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording}
                                onTouchStart={(e) => { e.preventDefault(); startRecording(); }} onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                                className="flex-1 flex items-center justify-center h-full px-6 rounded-[24px]"
                            >
                                {isRecording ? (
                                    <div className="flex items-center gap-3 animate-in fade-in duration-300">
                                        <div className="flex gap-1.5 items-center">
                                            {[1, 2, 3, 4].map(i => (
                                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                                            ))}
                                        </div>
                                        <span className="text-[14px] font-mono text-red-500 font-bold tracking-widest">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                                    </div>
                                ) : (
                                    <span className={`text-[14px] font-medium ${theme === 'light' ? 'text-black/40' : 'text-white/40'}`}>按住 说话</span>
                                )}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {inputMode === 'text' && inputText.trim() ? (
                            <button onClick={handleSend} disabled={isSending} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-90 ${theme === 'light' ? 'bg-black text-white' : 'bg-white text-black'}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                            </button>
                        ) : (
                            <button onClick={() => setInputMode(inputMode === 'text' ? 'voice' : 'text')} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border shrink-0 shadow-lg ${theme === 'light' ? 'bg-white border-black/5 text-black/40' : 'bg-white/5 border-white/5 text-white/40'}`}>
                                {inputMode === 'text' ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {viewerIndex !== null && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[10000] flex flex-col bg-black animate-in fade-in duration-500 overflow-hidden"
                    onPointerMoveCapture={(e) => {
                        // Reset timeout on ANY mouse movement
                        resetControlsTimeout();
                    }}
                    onTouchStart={(e) => {
                        handleTouchStart(e);
                        // Reset timeout on interaction
                        resetControlsTimeout();
                    }}
                    onTouchEnd={handleTouchEnd}
                    onClick={() => {
                        // Desktop click handling if needed, or rely on touches for mobile
                        if (!isMobile) {
                            // Desktop behavior
                        }
                    }}
                >
                    <div className={`absolute top-8 right-8 z-20 flex items-center gap-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        <button onClick={(e) => { e.stopPropagation(); const url = galleryImages[viewerIndex].url; const a = document.createElement('a'); a.href = url; a.download = `whisper_${Date.now()}.jpg`; document.body.appendChild(a); a.click(); document.body.removeChild(a); resetControlsTimeout(); }} className="text-white/60 hover:text-white transition-colors p-2"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                        <button onClick={(e) => { e.stopPropagation(); setViewerIndex(null); }} className="text-white/60 hover:text-white transition-colors p-2 glass-effect rounded-full"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    <div className={`absolute top-8 left-8 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-white font-medium tracking-widest text-[13px] uppercase">{galleryImages[viewerIndex].author}</span>
                            <span className="text-white/40 text-[10px] tabular-nums tracking-wider uppercase">{formatDistanceToNow(galleryImages[viewerIndex].timestamp, { addSuffix: true, locale: zhCN })}</span>
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center relative touch-none bg-black/90">
                        <TransformWrapper
                            initialScale={1}
                            minScale={0.5}
                            maxScale={5}
                            centerOnInit={true}
                            wheel={{ step: 0.2 }}
                            doubleClick={{ disabled: true }}
                            alignmentAnimation={{ sizeX: 0, sizeY: 0 }}
                            onTransformed={(e) => { viewerScaleRef.current = e.state.scale; }}
                            onPanning={resetControlsTimeout}
                            onPanningStop={resetControlsTimeout}
                            onZooming={resetControlsTimeout}
                            onZoomingStop={resetControlsTimeout}
                        >
                            {(controls) => {
                                transformControlsRef.current = controls;
                                const { centerView } = controls;
                                return (
                                    <React.Fragment>
                                        <TransformComponent wrapperClass="!w-screen !h-screen" contentClass="!w-screen !h-screen flex items-center justify-center">
                                            <img
                                                src={galleryImages[viewerIndex].url}
                                                className="max-w-[100vw] max-h-[100vh] w-auto h-auto object-contain shadow-2xl"
                                                alt="Full view"
                                                onLoad={() => {
                                                    setTimeout(() => centerView(), 50);
                                                    viewerScaleRef.current = 1;
                                                }}
                                                onClick={(e) => {
                                                    // Handle Click/Tap logic
                                                    // We need to distinguish Single Tap vs Double Tap
                                                    // React-zoom-pan-pinch handles double tap zoom natively if configured, 
                                                    // but we need our custom Single Tap logic.
                                                    // Ideally, we handle tap in the container touch handlers, but event propagation might be tricky.
                                                    // Let's rely on the container's gesture handler for swipes, and use a custom Handler for taps if native onClick is too slow or conflicted.
                                                }}
                                            />
                                        </TransformComponent>
                                        {/* Invisible Overlay for Gesture Capture if needed, but TransformWrapper wraps image */}
                                    </React.Fragment>
                                )
                            }}
                        </TransformWrapper>
                        {/* Navigation Arrows - Hide on mobile if swipe works, keep on desktop? Or hide if controls hidden */}
                        {viewerIndex > 0 && !isMobile && (
                            <button onClick={(e) => { e.stopPropagation(); setViewerIndex(viewerIndex - 1); resetControlsTimeout(); }} className={`absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all z-20 backdrop-blur-md border border-white/10 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                        )}
                        {viewerIndex < galleryImages.length - 1 && !isMobile && (
                            <button onClick={(e) => { e.stopPropagation(); setViewerIndex(viewerIndex + 1); resetControlsTimeout(); }} className={`absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all z-20 backdrop-blur-md border border-white/10 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                        )}
                    </div>
                    <div className={`absolute bottom-12 inset-x-0 flex justify-center z-20 items-center gap-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-2xl text-[12px] text-white/90 tabular-nums font-medium tracking-[0.2em]">{viewerIndex + 1} / {galleryImages.length}</div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
