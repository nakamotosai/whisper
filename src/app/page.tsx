'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ChatInterface } from '@/components/ChatInterface';
import { LocationState, ScaleLevel, Message, User, SubTabType, LiveStream, SharedImage, ThemeType, ActivityMarker, RoomStats, UserPresence } from '@/types';
import { getRoomId, getScaleLevel, getBucket, BUCKET_SIZES, getLocationName, getCountryCode, canJoinHex } from '@/lib/spatialService';
import { uploadImage, uploadVoice } from '@/lib/r2Storage';
import dynamic from 'next/dynamic';
import * as h3 from 'h3-js';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const MapWithNoSSR = dynamic(
  () => import('@/components/MapBackground').then((mod) => mod.MapBackground),
  { ssr: false, loading: () => <div className="h-screen w-screen bg-black flex items-center justify-center text-white/5 font-black tracking-[0.5em] uppercase">Initializing Spatial System...</div> }
);

const GUEST_USER: User = { id: 'guest', avatarSeed: 'default', name: '游客' };
const CHINA_DEFAULT = { lat: 35.8617, lng: 104.1954, zoom: 5 };
const JAPAN_DEFAULT = { lat: 36.2048, lng: 138.2529, zoom: 5 };

const RANDOM_NAMES = ['流浪的小星', '极光行者', '深海潜航', '赛博诗人', '夜幕幽灵', '霓虹信使', '虚空观察者', '重力叛逆者', '光速速递', '量子纠缠', '云端漫步', '像素浪人', '磁卡狂热', '电子蝴蝶', '光谱漫游', '暗物质', '临界点', '高维度', '波函数', '奇点降临'];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<User>(GUEST_USER);
  const [showUnifiedSettings, setShowUnifiedSettings] = useState(false);
  const [tempName, setTempName] = useState('');

  const [location, setLocation] = useState<LocationState>(CHINA_DEFAULT);

  const [activeScale, setActiveScale] = useState<ScaleLevel>(ScaleLevel.WORLD);
  const [userGps, setUserGps] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [forcedZoom, setForcedZoom] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [locationName, setLocationName] = useState<string>('');
  const [theme, setTheme] = useState<ThemeType>('dark');
  const [viewportHeight, setViewportHeight] = useState('100vh');
  const [reconnectCounter, setReconnectCounter] = useState(0);

  // Suggestion System
  const [showSuggestionPanel, setShowSuggestionPanel] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const suggestionScrollRef = useRef<HTMLDivElement>(null);

  // Existing chatrooms for hexagon display
  const [existingRoomIds, setExistingRoomIds] = useState<string[]>([]);

  const [allMessages, setAllMessages] = useState<Record<ScaleLevel, Message[]>>({
    [ScaleLevel.DISTRICT]: [],
    [ScaleLevel.CITY]: [],
    [ScaleLevel.WORLD]: []
  });

  const [roomIds, setRoomIds] = useState<Record<ScaleLevel, string>>({
    [ScaleLevel.DISTRICT]: '',
    [ScaleLevel.CITY]: '',
    [ScaleLevel.WORLD]: 'world_global'
  });

  const [unreadCounts, setUnreadCounts] = useState<Record<ScaleLevel, number>>({
    [ScaleLevel.DISTRICT]: 0,
    [ScaleLevel.CITY]: 0,
    [ScaleLevel.WORLD]: 0
  });

  const [onlineUsers, setOnlineUsers] = useState<Record<ScaleLevel, UserPresence[]>>({
    [ScaleLevel.DISTRICT]: [],
    [ScaleLevel.CITY]: [],
    [ScaleLevel.WORLD]: []
  });

  const [chatAnchor, setChatAnchor] = useState<[number, number] | null>([location.lat, location.lng]);
  const activeScaleRef = useRef<ScaleLevel>(activeScale);
  const channelsRef = useRef<Record<string, any>>({});
  const isUpdatingLocationRef = useRef(false);

  useEffect(() => { activeScaleRef.current = activeScale; }, [activeScale]);

  const getSmartInitialLocation = useCallback(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz.includes('Tokyo') || tz.includes('Japan') || tz.includes('Asia/Tokyo')) return JAPAN_DEFAULT;
      if (tz.includes('Seoul') || tz.includes('Korea')) return { lat: 35.9078, lng: 127.7669, zoom: 5 };
      if (tz.includes('Taipei') || tz.includes('Taiwan')) return { lat: 23.6978, lng: 120.9605, zoom: 5 };
      if (tz.includes('Singapore')) return { lat: 1.3521, lng: 103.8198, zoom: 5 };
      if (tz.includes('Sydney') || tz.includes('Australia')) return { lat: -33.8688, lng: 151.2093, zoom: 5 };
      if (tz.includes('America') || tz.includes('US/')) return { lat: 37.0902, lng: -95.7129, zoom: 5 };
      if (tz.includes('London') || tz.includes('Europe/')) return { lat: 48.8566, lng: 2.3522, zoom: 5 };
    } catch (e) { }
    return CHINA_DEFAULT;
  }, []);

  const fuzzCoordinates = useCallback((lat: number, lng: number): [number, number] => {
    // 0.018 degrees is roughly 2km fuzzed offset
    const offsetLat = (Math.random() - 0.5) * 0.018;
    const offsetLng = (Math.random() - 0.5) * 0.018;
    return [lat + offsetLat, lng + offsetLng];
  }, []);

  const executeRelocation = useCallback((coords: [number, number]) => {
    setUserGps(coords);
    setChatAnchor(coords);
    let z = 5;
    if (activeScaleRef.current === ScaleLevel.CITY) z = 10;
    if (activeScaleRef.current === ScaleLevel.DISTRICT) z = 14;

    const newLocation = { lat: coords[0], lng: coords[1], zoom: z };
    setLocation(newLocation);

    setForcedZoom(null);
    setTimeout(() => {
      setForcedZoom(z);
    }, 100);

    localStorage.setItem('whisper_last_location', JSON.stringify(newLocation));
    console.log('Relocated to (fuzzed):', coords, 'zoom:', z);
  }, []);

  const handleReturnToUser = useCallback(() => {
    console.log('Relocation requested, userGps:', userGps);
    if (userGps) {
      executeRelocation(userGps);
    } else {
      if (navigator.geolocation) {
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const fuzzed = fuzzCoordinates(pos.coords.latitude, pos.coords.longitude);
            executeRelocation(fuzzed);
            setIsLocating(false);
          },
          (err) => {
            console.error('Geolocation failed:', err);
            setIsLocating(false);
            alert('获取位置失败，请检查浏览器权限。');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    }
  }, [userGps, executeRelocation, fuzzCoordinates]);

  useEffect(() => {
    setMounted(true);
    document.title = "乌托邦 | UTOPIA";
    const id = localStorage.getItem('whisper_user_id') || Math.random().toString(36).substring(2, 8);
    const seed = localStorage.getItem('whisper_avatar_seed') || Math.random().toString();
    const storedName = localStorage.getItem('whisper_user_name');

    localStorage.setItem('whisper_user_id', id);
    localStorage.setItem('whisper_avatar_seed', seed);
    if (!storedName) { setShowUnifiedSettings(true); setCurrentUser({ id, avatarSeed: seed, name: '游客' }); }
    else { setCurrentUser({ id, avatarSeed: seed, name: storedName }); }

    const smartLoc = getSmartInitialLocation();
    setLocation(smartLoc);
    setChatAnchor([smartLoc.lat, smartLoc.lng]);

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    const handleResize = () => {
      checkMobile();
      // Use visualViewport for accurate mobile viewport (handles keyboard)
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
        // If the keyboard is forcing a scroll, reset it
        if (window.scrollY > 0) {
          window.scrollTo(0, 0);
        }
      } else {
        setViewportHeight(`${window.innerHeight}px`);
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', () => { if (window.scrollY > 0) window.scrollTo(0, 0); }); // Aggressive scroll lock
    // Listen to both resize and scroll on visualViewport for iOS keyboard
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    handleResize();

    const handleVisibilityChange = () => { if (document.visibilityState === 'visible') setReconnectCounter(prev => prev + 1); };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const storedTheme = localStorage.getItem('whisper_theme') as ThemeType;
    if (storedTheme) setTheme(storedTheme);
    else setTheme('dark');

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [getSmartInitialLocation]);

  // Initial Geolocation and Setup
  useEffect(() => {
    if (!mounted) return;

    setActiveScale(ScaleLevel.WORLD);
    setIsChatOpen(true);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Apply 2km privacy fuzzing immediately upon receiving GPS
          const fuzzed = fuzzCoordinates(pos.coords.latitude, pos.coords.longitude);
          console.log('GPS received and fuzzed for privacy:', fuzzed);
          setUserGps(fuzzed);
          setCurrentUser(prev => ({ ...prev, countryCode: getCountryCode(pos.coords.latitude, pos.coords.longitude) }));

          executeRelocation(fuzzed);
          setIsLocating(false);
        },
        (err) => {
          console.warn('Initial geolocation failed or denied, staying at smart default:', err);
          setIsLocating(false);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    } else {
      setIsLocating(false);
    }
  }, [mounted, executeRelocation, fuzzCoordinates]);

  useEffect(() => {
    if (!chatAnchor || !mounted) return;
    const dRoomId = getRoomId(ScaleLevel.DISTRICT, chatAnchor[0], chatAnchor[1]);
    const cRoomId = getRoomId(ScaleLevel.CITY, chatAnchor[0], chatAnchor[1]);
    const wRoomId = 'world_global';
    setRoomIds({ [ScaleLevel.DISTRICT]: dRoomId, [ScaleLevel.CITY]: cRoomId, [ScaleLevel.WORLD]: wRoomId });
    getLocationName(chatAnchor[0], chatAnchor[1], activeScale).then(setLocationName);
  }, [chatAnchor, mounted, activeScale]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('whisper_theme', theme);
    }
  }, [theme, mounted]);

  useEffect(() => {
    const currentZoom = forcedZoom !== null ? forcedZoom : location.zoom;
    const newScale = getScaleLevel(currentZoom);
    if (newScale !== activeScale) {
      setActiveScale(newScale);
    }
  }, [location.zoom, forcedZoom, activeScale]);

  const onLocationChange = useCallback((loc: any) => {
    if (isUpdatingLocationRef.current) return;
    if (loc.isInteraction) {
      setForcedZoom(null);
      return;
    }
    setLocation(loc);
    setForcedZoom(null);
    localStorage.setItem('whisper_last_location', JSON.stringify(loc));
  }, []);

  const onTabChange = useCallback((s: ScaleLevel) => {
    setActiveScale(s);
    setUnreadCounts(prev => ({ ...prev, [s]: 0 }));
    let z = 5; if (s === ScaleLevel.CITY) z = 10; if (s === ScaleLevel.DISTRICT) z = 14;
    setForcedZoom(z);
    if (chatAnchor) setLocation({ lat: chatAnchor[0], lng: chatAnchor[1], zoom: z });
  }, [chatAnchor]);

  // Fetch existing chatrooms for hexagon display
  const fetchExistingRooms = useCallback(async () => {
    if (!supabase || activeScale === ScaleLevel.WORLD) {
      setExistingRoomIds([]);
      return;
    }
    const prefix = activeScale.toLowerCase();
    const { data } = await supabase.from('messages').select('room_id').like('room_id', `${prefix}_%`);
    if (data) {
      const uniqueRooms = Array.from(new Set(data.map(d => d.room_id)));
      setExistingRoomIds(uniqueRooms);
    }
  }, [activeScale]);

  useEffect(() => {
    fetchExistingRooms();
  }, [activeScale, fetchExistingRooms]);

  // Handle hexagon click to switch chatroom
  const handleHexClick = useCallback((roomId: string, lat: number, lng: number) => {
    if (!userGps) return;
    const h3Index = roomId.split('_')[1];
    if (!h3Index) return;
    if (!canJoinHex(userGps[0], userGps[1], h3Index, activeScale)) {
      console.warn('Cannot join hex outside range');
      return;
    }
    // Update room ID for current scale
    setRoomIds(prev => ({ ...prev, [activeScale]: roomId }));
    // Update chat anchor for display
    setChatAnchor([lat, lng]);
    // Update location name
    getLocationName(lat, lng, activeScale).then(setLocationName);
    // Clear messages for this scale to force reload
    setAllMessages(prev => ({ ...prev, [activeScale]: [] }));
  }, [userGps, activeScale]);

  // Suggestion Board Sync & Realtime
  useEffect(() => {
    if (!showSuggestionPanel || !supabase) return;

    // Initial Fetch
    supabase.from('suggestions').select('*').order('timestamp', { ascending: false }).limit(50).then(({ data }) => {
      if (data) setSuggestions(data);
    });

    // Realtime Subscription
    const channel = supabase.channel('suggestions_board')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions' }, (payload) => {
        setSuggestions(prev => {
          if (prev.some(s => s.id === payload.new.id)) return prev;
          return [payload.new as any, ...prev].slice(0, 50);
        });
      })
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [showSuggestionPanel]);

  useEffect(() => {
    if (!mounted || !supabase) return;
    Object.values(channelsRef.current).forEach(c => supabase!.removeChannel(c));
    channelsRef.current = {};
    const scales = [ScaleLevel.DISTRICT, ScaleLevel.CITY, ScaleLevel.WORLD];
    scales.forEach(scale => {
      const rid = roomIds[scale];
      if (!rid) return;
      supabase!.from('messages').select('*').eq('room_id', rid).order('timestamp', { ascending: true }).limit(500).then(({ data }) => {
        if (data) setAllMessages(prev => {
          const fetched = data.map((m: any) => ({
            id: m.id, userId: m.user_id, userName: m.user_name || `NODE_${m.user_id.substring(0, 4)}`, userAvatarSeed: m.user_avatar_seed,
            content: m.content, timestamp: new Date(m.timestamp).getTime(), type: m.type, countryCode: m.country_code, isRecalled: m.is_recalled || m.is_recalled === 'true'
          }));
          const ids = new Set(prev[scale].map(m => m.id));
          return { ...prev, [scale]: [...prev[scale], ...fetched.filter(m => !ids.has(m.id))].sort((a, b) => a.timestamp - b.timestamp) };
        });
      });
      // CRITICAL FIX: Channel name MUST be constant for all users in the room to share broadcasts.
      // Do NOT include reconnectCounter in the topic.
      const channel = supabase!.channel(`room_${rid}`).on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        setAllMessages(prev => prev[scale].some(m => m.id === payload.id) ? prev : { ...prev, [scale]: [...prev[scale], payload] });
        if (scale !== activeScaleRef.current) setUnreadCounts(prev => ({ ...prev, [scale]: prev[scale] + 1 }));
      }).on('broadcast', { event: 'chat-recall' }, ({ payload }) => {
        setAllMessages(prev => ({ ...prev, [scale]: prev[scale].map(m => m.id === payload.id ? { ...m, isRecalled: true } : m) }));
      }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${rid}` }, (payload) => {
        // Handle database updates for recall
        if (payload.new.is_recalled) {
          setAllMessages(prev => ({ ...prev, [scale]: prev[scale].map(m => m.id === payload.new.id ? { ...m, isRecalled: true } : m) }));
        }
      }).on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const users: UserPresence[] = [];
        for (const key in newState) {
          users.push(...(newState[key] as any));
        }
        setOnlineUsers(prev => ({ ...prev, [scale]: users }));
      }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            user_name: currentUser.name,
            avatarSeed: currentUser.avatarSeed,
            lat: userGps ? userGps[0] : location.lat,
            lng: userGps ? userGps[1] : location.lng,
            onlineAt: Date.now()
          });
        }
        // Reconnect logic handles itself via the useEffect dependency on reconnectCounter,
        // which will teardown and recreate this subscription.
        console.log(`Channel room_${rid} status:`, status);
      });
      channelsRef.current[rid] = channel;
    });
    return () => Object.values(channelsRef.current).forEach(c => supabase!.removeChannel(c));
  }, [mounted, roomIds, currentUser, reconnectCounter]);

  const handleSettingsSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const finalName = tempName.trim() || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    setCurrentUser(prev => ({ ...prev, name: finalName }));
    localStorage.setItem('whisper_user_name', finalName);
    localStorage.setItem('whisper_theme', theme);
    setShowUnifiedSettings(false);
  };

  const handleSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = suggestionText.trim();
    if (!content || isSubmittingSuggestion) return;
    const lastTime = localStorage.getItem('last_suggestion_time');
    const now = Date.now();
    if (lastTime && now - parseInt(lastTime) < 60000) { alert(`提建议频率限制：每分钟一次`); return; }
    setIsSubmittingSuggestion(true);
    const tempId = Math.random().toString(36).substring(2, 11);
    const opt = { id: tempId, user_id: currentUser.id, user_name: currentUser.name, content: content, timestamp: new Date().toISOString() };
    setSuggestions(prev => [...prev, opt]);
    setSuggestionText('');
    try {
      if (!supabase) throw new Error('Supabase not connected');
      const { data, error } = await supabase.from('suggestions').insert({ user_id: currentUser.id, user_name: currentUser.name, content, timestamp: opt.timestamp }).select();
      if (error) throw error;
      if (data?.[0]) setSuggestions(prev => prev.map(s => s.id === tempId ? data[0] : s));
      localStorage.setItem('last_suggestion_time', now.toString());
      setSuggestionStatus('success');
      setTimeout(() => setSuggestionStatus('idle'), 2000);
    } catch (err: any) {
      setSuggestions(prev => prev.filter(s => s.id !== tempId));
      setSuggestionText(content);
      setSuggestionStatus('error');
      alert(`提交失败: ${err.message}`);
    } finally { setIsSubmittingSuggestion(false); }
  };

  const onSendMessage = async (content: string) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;
    const msg = { id: Math.random().toString(36).substring(2, 11), userId: currentUser.id, userName: currentUser.name, userAvatarSeed: currentUser.avatarSeed, content, timestamp: Date.now(), type: 'text' as const, countryCode: currentUser.countryCode };
    setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], msg] }));
    try {
      const { error } = await supabase.from('messages').insert({ id: msg.id, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed, content, timestamp: new Date(msg.timestamp).toISOString(), type: 'text' });
      if (error) throw error;
      if (channelsRef.current[rid]) await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: msg });
    } catch (err) { }
  };

  const onRecallMessage = async (messageId: string) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;
    setAllMessages(prev => ({ ...prev, [activeScale]: prev[activeScale].map(m => m.id === messageId ? { ...m, isRecalled: true } : m) }));
    try {
      const { error } = await supabase.from('messages').update({ is_recalled: true }).eq('id', messageId);
      if (error) throw error;
      if (channelsRef.current[rid]) await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-recall', payload: { id: messageId } });
    } catch (err) { }
  };

  const onUploadImage = async (file: File) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;
    const tempId = Math.random().toString(36).substring(2, 11);
    const localUrl = URL.createObjectURL(file);
    const tempMsg = { id: tempId, userId: currentUser.id, userName: currentUser.name, userAvatarSeed: currentUser.avatarSeed, content: localUrl, timestamp: Date.now(), type: 'image' as const, countryCode: currentUser.countryCode };
    setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], tempMsg] }));
    try {
      const result = await uploadImage(file);
      if (!result.success || !result.url) throw new Error(result.error);
      const finalMsg = { ...tempMsg, content: result.url };
      setAllMessages(prev => ({ ...prev, [activeScale]: prev[activeScale].map(m => m.id === tempId ? finalMsg : m) }));
      const { error: dbError } = await supabase.from('messages').insert({ id: tempId, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed, content: result.url, timestamp: new Date(finalMsg.timestamp).toISOString(), type: 'image' });
      if (dbError) throw dbError;
      if (channelsRef.current[rid]) await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: finalMsg });
    } catch (err) { setAllMessages(prev => ({ ...prev, [activeScale]: prev[activeScale].filter(m => m.id !== tempId) })); }
  };

  const onUploadVoice = async (blob: Blob, duration: number) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;
    try {
      const result = await uploadVoice(blob);
      if (!result.success || !result.url) throw new Error(result.error);
      const msg = { id: Math.random().toString(36).substring(2, 11), userId: currentUser.id, userName: currentUser.name, userAvatarSeed: currentUser.avatarSeed, content: result.url, timestamp: Date.now(), type: 'voice' as const, countryCode: currentUser.countryCode };
      setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], msg] }));
      const { error: dbError } = await supabase.from('messages').insert({ id: msg.id, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed, content: result.url, timestamp: new Date(msg.timestamp).toISOString(), type: 'voice' });
      if (dbError) throw dbError;
      if (channelsRef.current[rid]) await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: msg });
    } catch (err) { }
  };

  if (!mounted) return <div className="h-screen w-screen bg-black" />;

  const isLocatingOverlay = isLocating && (
    <div className="fixed inset-0 z-[100000] bg-black/40 backdrop-blur-md flex items-center justify-center p-6 text-center">
      <div className="flex flex-col items-center gap-6 max-w-xs">
        <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-white animate-spin relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-full blur-md bg-white/10 animate-pulse" />
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-white font-black tracking-[0.2em] uppercase text-sm">正在请求地理位置...</span>
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
            <span className="text-white/50 text-[10px] font-bold leading-relaxed uppercase tracking-widest">
              隐私保护已激活：系统将对您的真实坐标添加约2公里的随机偏移，确保您的精确驻地不被公开。
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex w-screen bg-black overflow-hidden select-none relative flex-col touch-none" style={{ height: viewportHeight }}>
      {isLocatingOverlay}
      {showUnifiedSettings && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 backdrop-blur-md bg-black/40">
          <div className="absolute inset-0" onClick={() => currentUser.name !== '游客' && setShowUnifiedSettings(false)} />
          <div className="w-full max-sm:max-w-none max-w-sm crystal-black-outer p-5 rounded-[32px] container-rainbow-main flex flex-col gap-4 animate-in zoom-in-95 duration-500 relative shadow-[0_0_100px_rgba(0,0,0,0.5)]">
            {currentUser.name !== '游客' && (
              <button onClick={() => setShowUnifiedSettings(false)} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all z-50 border border-white/5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}

            <div className="flex flex-col gap-1 px-1">
              <div className="flex items-center gap-2">
                <img src="/logo.png" className="w-6 h-6 object-contain" alt="Logo" />
                <h3 className="text-white text-xs font-black uppercase tracking-widest opacity-50">乌托邦</h3>
              </div>
              <p className="text-white/35 text-[9px] font-bold uppercase tracking-wider">Privacy secured with 2km random offset</p>
            </div>

            <form onSubmit={handleSettingsSubmit} className="flex flex-col gap-3.5 pt-1">
              <input type="text" maxLength={12} placeholder="在这更改昵称" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold outline-none ring-2 ring-transparent focus:ring-white/10 transition-all placeholder:text-white/35 text-sm" value={tempName} onChange={(e) => setTempName(e.target.value)} autoFocus />
              <div className="grid grid-cols-2 gap-2.5 select-none">
                <div onClick={() => setTheme('dark')} className={`py-2 px-4 rounded-xl border flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-95 ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 opacity-50 hover:opacity-80'}`}>
                  <div className="w-5 h-5 rounded-full bg-[#1a1a1a] border border-white/20 shadow-[0_0_100px_rgba(255,255,255,0.1)] flex-shrink-0" /><span className="text-[11px] font-black text-white/80 tracking-widest uppercase">深色</span>
                </div>
                <div onClick={() => setTheme('light')} className={`py-2 px-4 rounded-xl border flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-95 ${theme === 'light' ? 'bg-white border-white text-black' : 'bg-transparent border-white/5 opacity-50 hover:opacity-80'}`}>
                  <div className="w-5 h-5 rounded-full bg-white border border-gray-200 shadow-sm flex-shrink-0" /><span className={`text-[11px] font-black tracking-widest uppercase ${theme === 'light' ? 'text-black' : 'text-white/80'}`}>浅色</span>
                </div>
              </div>

              <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">隐私保护说明</span>
                </div>
                <p className="text-[10px] text-white/45 font-bold leading-relaxed lowercase tracking-wide">
                  为了保护您的驻地隐私，系统已自动为您的实时位置添加约 **2公里** 的随机偏移。这意味着即使在"地区"频道中，其他用户也无法精确推断您的真实住所。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setShowSuggestionPanel(true)} className="w-full py-2.5 bg-white/5 text-white/50 font-black uppercase tracking-[0.2em] rounded-xl active:scale-[0.98] transition-all hover:bg-white/10 border border-white/5 text-xs">提建议</button>
                <button type="submit" className="w-full py-2.5 bg-white text-black font-black uppercase tracking-[0.2em] rounded-xl active:scale-[0.98] transition-all hover:shadow-[0_0_30_px_rgba(255,255,255,0.3)] shadow-xl text-xs">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showSuggestionPanel && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-3xl bg-black/60">
          <div className="w-full max-w-[500px] h-[85vh] crystal-black-outer rounded-[40px] container-rainbow-main flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-700 relative shadow-[0_0_150px_rgba(0,0,0,0.8)]">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5 backdrop-blur-xl">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" className="w-8 h-8 object-contain" alt="Logo" />
                  <h2 className="text-lg font-black text-white tracking-widest uppercase">进化建议看板</h2>
                </div>
                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-[10px] font-black text-white/50 uppercase tracking-widest">实时接收其他特工建议</span></div>
              </div>
              <button onClick={() => setShowSuggestionPanel(false)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all border border-white/5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div ref={suggestionScrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth custom-scrollbar overscroll-contain">
              {suggestions.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-white/20 underline uppercase tracking-widest">暂无建议</div> : suggestions.map((s, idx) => (
                <div key={s.id || idx} className={`flex flex-col gap-2 ${s.user_id === currentUser.id ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 px-1"><span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{s.user_id === currentUser.id ? '我' : s.user_name}</span><span className="text-[8px] font-medium text-white/20">{s.timestamp ? formatDistanceToNow(new Date(s.timestamp), { addSuffix: true, locale: zhCN }) : '刚刚'}</span></div>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] font-medium leading-relaxed border shadow-sm ${s.user_id === currentUser.id ? 'bg-white/15 border-white/30 text-white rounded-tr-none' : 'bg-white/5 border-white/10 text-white/80 rounded-tl-none'}`}>{s.content}</div>
                </div>
              ))}
            </div>
            <div className="p-6 bg-black/40 border-t border-white/10 backdrop-blur-2xl">
              <form onSubmit={handleSuggestionSubmit} className="flex flex-col gap-4">
                <textarea className="w-full h-24 bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-medium outline-none ring-2 ring-transparent focus:ring-white/10 transition-all placeholder:text-white/20 resize-none text-sm leading-relaxed" placeholder="输入建议..." value={suggestionText} onChange={(e) => setSuggestionText(e.target.value)} />
                <button type="submit" disabled={isSubmittingSuggestion || !suggestionText.trim()} className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${suggestionStatus === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] shadow-xl'}`}>{isSubmittingSuggestion ? '发送中...' : suggestionStatus === 'success' ? '已发送' : '发送进化建议'}</button>
              </form>
            </div>
          </div>
        </div>
      )}
      <div className="absolute inset-0 z-0">
        <MapWithNoSSR
          initialPosition={[location.lat, location.lng]}
          userLocation={userGps}
          onLocationChange={onLocationChange}
          onMarkerClick={(m: ActivityMarker) => { setChatAnchor([m.lat, m.lng]); setIsChatOpen(true); }}
          forcedZoom={forcedZoom}
          fetchActivity={async (la: number, ln: number, z: number) => {
            if (!supabase) return [];
            const scale = getScaleLevel(z);
            if (scale === ScaleLevel.WORLD) return [];
            const prefix = scale.toLowerCase();
            const { data } = await supabase.from('messages').select('room_id').like('room_id', `${prefix}_%`);
            if (!data) return [];
            const uni = Array.from(new Set(data.map(d => d.room_id)));
            return uni.map(rid => { try { const h3Index = rid.split('_')[1]; const [lt, lg] = h3.cellToLatLng(h3Index); return { id: rid, lat: lt, lng: lg }; } catch (e) { return null; } }).filter(Boolean) as ActivityMarker[];
          }}
          theme={theme}
          existingRoomIds={existingRoomIds}
          onHexClick={handleHexClick}
          activeRoomId={roomIds[activeScale]}
          onlineUsers={onlineUsers[activeScale]}
          currentUserId={currentUser.id}
        />
      </div>

      {/* Desktop Logo Overlay */}
      {!isMobile && (
        <div className="fixed top-8 left-6 z-[5000] flex items-center gap-4 pointer-events-none group animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="w-12 h-12 crystal-nav-vertical flex items-center justify-center p-2.5 shadow-2xl relative overflow-hidden pointer-events-auto">
            <img
              src="/logo.png"
              className="w-full h-full object-contain relative z-20 group-hover:scale-110 transition-transform duration-500"
              alt="Logo"
            />
          </div>
          <div className="flex flex-col items-center gap-0 pointer-events-auto">
            <div className="flex items-center h-9">
              <img
                src="/utopia.png"
                className={`h-full w-auto object-contain transition-all duration-500 ${theme === 'dark' ? 'invert opacity-60' : 'opacity-60'}`}
                alt="UTOPIA Logo"
              />
            </div>
            <span className={`text-[10px] font-normal tracking-tighter uppercase transition-colors duration-500 ${theme === 'light' ? 'text-black/60' : 'text-white/60'} -mt-1`}>
              乌托邦 | 全球匿名实时聊天室
            </span>
          </div>
        </div>
      )}

      {!isMobile && (
        <div className="fixed left-6 bottom-6 flex flex-col gap-4 z-[5000]">
          <button onClick={handleReturnToUser} className={`w-12 h-12 crystal-nav-vertical flex items-center justify-center transition-all shadow-xl group ${theme === 'light' ? 'text-black/50 hover:text-black' : 'text-white/50 hover:text-white'}`}><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg></button>
          <button onClick={() => { setTempName(currentUser.name === '游客' ? '' : currentUser.name); setShowUnifiedSettings(true); }} className={`w-12 h-12 crystal-nav-vertical flex items-center justify-center transition-all shadow-xl group ${theme === 'light' ? 'text-black/50 hover:text-black' : 'text-white/50 hover:text-white'}`}><svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
        </div>
      )}
      {!isMobile && (
        <div className="fixed left-6 top-1/2 -translate-y-1/2 w-12 h-fit crystal-nav-vertical z-[5000] flex flex-col p-1.5 gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
            const isActive = activeScale === tab.value; const hasUnread = unreadCounts[tab.value] > 0; const themeColor = tab.value === ScaleLevel.DISTRICT ? '#22d3ee' : tab.value === ScaleLevel.CITY ? '#fbbf24' : '#818cf8';
            return (
              <button key={tab.value} onClick={() => onTabChange(tab.value)} className={`w-full py-6 flex flex-col items-center justify-center text-[10px] font-black transition-all duration-700 rounded-xl relative ${isActive ? (theme === 'light' ? 'text-gray-900' : 'text-white') : (theme === 'light' ? 'text-black/30 hover:text-black/50' : 'text-white/30 hover:text-white/45')}`}>
                {isActive && <div className={`absolute inset-0 rounded-xl border ${theme === 'light' ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`} />}
                <span className="relative z-10 flex flex-col items-center gap-0.5 leading-none">
                  {tab.label.split('').map((char, i) => <span key={i}>{char}</span>)}
                </span>
                {isActive && <div className="absolute right-0.5 w-0.5 h-3 rounded-full" style={{ background: themeColor, boxShadow: `0 0 8px ${themeColor}` }} />}
                {hasUnread && !isActive && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
              </button>
            );
          })}
        </div>
      )}
      {isMobile && !isChatOpen && (
        <div className="fixed inset-x-4 bottom-10 z-[5000] flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
          {/* Mobile Floating Text Logo */}
          <div className="flex flex-col items-center gap-0 pointer-events-none mb-2 drop-shadow-2xl">
            <img
              src="/utopia.png"
              className={`h-8 w-auto object-contain transition-all duration-500 ${theme === 'dark' ? 'invert opacity-60' : 'opacity-60'}`}
              alt="UTOPIA Logo"
            />
            <span className={`text-[9px] font-normal tracking-tighter uppercase transition-colors duration-500 ${theme === 'light' ? 'text-black/60' : 'text-white/60'} -mt-0.5`}>
              乌托邦 | 全球匿名实时聊天室
            </span>
          </div>
          <div className="w-full max-w-[360px] relative flex items-center justify-center">
            <div className="w-full max-w-[260px] h-12 bg-[#1a1a1a]/90 backdrop-blur-3xl p-1 rounded-full border border-white/10 shadow-2xl flex items-center">
              {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
                const isActive = activeScale === tab.value;
                return <button key={tab.value} onClick={() => onTabChange(tab.value)} className={`flex-1 h-full rounded-full text-[11px] font-black tracking-widest uppercase transition-all duration-500 ${isActive ? 'text-white bg-[#333333] shadow-lg' : 'text-white/40'}`}>{tab.label}</button>;
              })}
            </div>
            <button onClick={() => { setTempName(currentUser.name === '游客' ? '' : currentUser.name); setShowUnifiedSettings(true); }} className="absolute right-0 w-12 h-12 rounded-full bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white/50 hover:text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
          </div>
          <div className="w-full max-w-[360px] relative flex items-center justify-center">
            <button onClick={() => setIsChatOpen(true)} className="w-full max-w-[260px] h-12 bg-[#1a1a1a]/90 backdrop-blur-3xl rounded-full border border-white/10 shadow-2xl flex items-center justify-center text-white font-black uppercase tracking-[0.4em] text-[11px] active:scale-95 transition-all">恢复聊天</button>
            <button onClick={handleReturnToUser} className="absolute right-0 w-12 h-12 rounded-full bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white/50 hover:text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg></button>
          </div>
        </div>
      )}
      <div
        className={`absolute transition-all duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)] z-[1000] ${(!isMobile || isChatOpen) ? (isMobile ? 'top-[4vw] left-[4vw] right-[4vw] bottom-[max(4vw,env(safe-area-inset-bottom))]' : 'top-6 right-6 bottom-6 w-[360px] translate-x-0 opacity-100') : (isMobile ? 'translate-y-[120%] opacity-0' : 'top-6 right-6 bottom-6 w-[360px] translate-x-[120%] opacity-0')}`}
        onTouchMove={(e) => { if (isMobile) e.stopPropagation(); }}
        onTouchStart={(e) => { if (isMobile) e.stopPropagation(); }}
      >
        <ChatInterface
          scale={activeScale}
          roomId={roomIds[activeScale]}
          messages={allMessages[activeScale] || []}
          unreadCounts={unreadCounts}
          user={currentUser}
          onSendMessage={onSendMessage}
          onUploadImage={onUploadImage}
          onUploadVoice={onUploadVoice}
          onRecallMessage={onRecallMessage}
          fetchLiveStreams={async () => []}
          fetchSharedImages={async () => []}
          isOpen={!isMobile || isChatOpen}
          onToggle={() => setIsChatOpen(false)}
          isMobile={isMobile}
          onTabChange={onTabChange}
          locationName={locationName}
          onOpenSettings={() => { setTempName(currentUser.name === '游客' ? '' : currentUser.name); setShowUnifiedSettings(true); }}
          onUpdateUser={(data) => { if (data.name) { setCurrentUser(prev => ({ ...prev, name: data.name! })); localStorage.setItem('whisper_user_name', data.name!); } }}
          theme={theme}
          onlineCounts={{
            [ScaleLevel.DISTRICT]: onlineUsers[ScaleLevel.DISTRICT].length,
            [ScaleLevel.CITY]: onlineUsers[ScaleLevel.CITY].length,
            [ScaleLevel.WORLD]: onlineUsers[ScaleLevel.WORLD].length
          }}
        />
      </div>
      <style>{`
                .crystal-nav-vertical { position: relative; background: ${theme === 'light' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)'}; backdrop-filter: blur(12px); border-radius: 20px; border: 1.5px solid transparent; }
                .crystal-nav-vertical::after { content: ""; position: absolute; inset: 0; border-radius: 20px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0.8; z-index: 10; animation: rainbow-drift 6s linear infinite; }
                .crystal-black-outer { background: ${theme === 'light' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.35)'}; backdrop-filter: blur(12px); }
                .container-rainbow-main { position: relative; border: 1px solid ${theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255, 255, 255, 0.05)'}; }
                .container-rainbow-main::after { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0.8; z-index: 50; animation: rainbow-drift 6s linear infinite; }
                .bubble-rainbow { position: relative; background: ${theme === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(26, 26, 26, 0.5)'} !important; backdrop-filter: blur(12px); border-radius: 20px; }
                .bubble-rainbow::before { content: ""; position: absolute; inset: 0; border-radius: 20px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; z-index: 10; animation: rainbow-drift 6s linear infinite; }
                .bubble-rainbow > * { position: relative; z-index: 1; }
                @keyframes rainbow-drift { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
                .custom-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
                .custom-scrollbar::-webkit-scrollbar { display: none; }
                
                /* Option B: Liquid Glow Cursor Implementation */
                * {
                    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Ccircle cx='6' cy='6' r='3.5' fill='${theme === 'light' ? 'black' : 'white'}' opacity='0.9'/%3E%3C/svg%3E") 6 6, auto !important;
                }
                
                button, a, .leaflet-marker-icon, .activity-dot, [role="button"], input, textarea, .self-marker, .crystal-nav-vertical * {
                    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='${theme === 'light' ? 'black' : 'white'}' stroke-width='1.5' opacity='0.8'/%3E%3Ccircle cx='16' cy='16' r='2' fill='${theme === 'light' ? 'black' : 'white'}'/%3E%3C/svg%3E") 16 16, pointer !important;
                }
            `}</style>
    </div>
  );
}
