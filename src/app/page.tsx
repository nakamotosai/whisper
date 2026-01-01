'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ChatInterface } from '@/components/ChatInterface';
import { LocationState, Message, User, ScaleLevel } from '@/types';
import { getRoomId, getScaleLevel, getBucket, BUCKET_SIZES } from '@/lib/spatialService';
import { uploadImage, uploadVoice } from '@/lib/r2Storage';
import dynamic from 'next/dynamic';

const MapWithNoSSR = dynamic(
  () => import('@/components/MapBackground').then((mod) => mod.MapBackground),
  { ssr: false, loading: () => <div className="h-screen w-screen bg-black flex items-center justify-center text-white/5 font-black tracking-[0.5em] uppercase">Initializing Map...</div> }
);

const GUEST_USER: User = { id: 'guest', avatarSeed: 'default', name: '游客' };

const RANDOM_NAMES = ['流浪的小星', '极光行者', '深海潜航', '赛博诗人', '夜幕幽灵', '霓虹信使', '虚空观察者', '重力叛逆者', '光速速递', '量子纠缠', '云端漫步', '像素浪人', '磁卡狂热', '电子蝴蝶', '光谱漫游', '暗物质', '临界点', '高维度', '波函数', '奇点降临'];

const snapToGrid = (coord: number, size: number): string => {
  if (size === 0) return 'global';
  return (Math.floor(coord / size) * size).toFixed(3);
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<User>(GUEST_USER);
  const [showNameModal, setShowNameModal] = useState(false);
  const [tempName, setTempName] = useState('');

  const [location, setLocation] = useState<LocationState>({ lat: 35.8617, lng: 104.1954, zoom: 5 });
  const [activeScale, setActiveScale] = useState<ScaleLevel>(ScaleLevel.WORLD);
  const [userGps, setUserGps] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [forcedZoom, setForcedZoom] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

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

  const [chatAnchor, setChatAnchor] = useState<[number, number] | null>(null);
  const activeScaleRef = useRef<ScaleLevel>(activeScale);
  const channelsRef = useRef<Record<string, any>>({});

  useEffect(() => { activeScaleRef.current = activeScale; }, [activeScale]);

  useEffect(() => {
    setMounted(true);
    const id = localStorage.getItem('whisper_user_id') || Math.random().toString(36).substring(2, 8);
    const seed = localStorage.getItem('whisper_avatar_seed') || Math.random().toString();
    const storedName = localStorage.getItem('whisper_user_name');

    localStorage.setItem('whisper_user_id', id);
    localStorage.setItem('whisper_avatar_seed', seed);

    if (!storedName) {
      setShowNameModal(true);
    } else {
      setCurrentUser({ id, avatarSeed: seed, name: storedName });
    }

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    checkMobile();
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleNameSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const finalName = tempName.trim() || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    const newUser = { ...currentUser, name: finalName };
    setCurrentUser(newUser);
    localStorage.setItem('whisper_user_name', finalName);
    setShowNameModal(false);
  };

  useEffect(() => {
    if (!mounted) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserGps([latitude, longitude]);
          setChatAnchor([latitude, longitude]);
          setLocation({ lat: latitude, lng: longitude, zoom: 5 });
          setIsLocating(false);
        },
        () => {
          setChatAnchor([location.lat, location.lng]);
          setIsLocating(false);
        }
      );
    } else {
      setChatAnchor([location.lat, location.lng]);
      setIsLocating(false);
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !chatAnchor) return;
    const dSize = BUCKET_SIZES[ScaleLevel.DISTRICT];
    const cSize = BUCKET_SIZES[ScaleLevel.CITY];

    const dRoomId = `district_${snapToGrid(chatAnchor[0], dSize)}_${snapToGrid(chatAnchor[1], dSize)}`;
    const cRoomId = `city_${snapToGrid(chatAnchor[0], cSize)}_${snapToGrid(chatAnchor[1], cSize)}`;
    const wRoomId = 'world_global';

    setRoomIds(prev => {
      if (prev[ScaleLevel.DISTRICT] === dRoomId && prev[ScaleLevel.CITY] === cRoomId) return prev;
      return {
        [ScaleLevel.DISTRICT]: dRoomId,
        [ScaleLevel.CITY]: cRoomId,
        [ScaleLevel.WORLD]: wRoomId
      };
    });
  }, [chatAnchor, mounted]);

  useEffect(() => {
    if (forcedZoom !== null) {
      setActiveScale(getScaleLevel(forcedZoom));
    } else {
      setActiveScale(getScaleLevel(location.zoom));
    }
  }, [location.zoom, forcedZoom]);

  const onTabChange = (s: ScaleLevel) => {
    setActiveScale(s);
    setUnreadCounts(prev => ({ ...prev, [s]: 0 }));
    let z = 5; if (s === ScaleLevel.CITY) z = 10; if (s === ScaleLevel.DISTRICT) z = 14;
    setForcedZoom(z);

    if (chatAnchor) {
      setLocation({ lat: chatAnchor[0], lng: chatAnchor[1], zoom: z });
    }
  };

  useEffect(() => {
    if (!mounted || !supabase) return;
    const scales = [ScaleLevel.DISTRICT, ScaleLevel.CITY, ScaleLevel.WORLD];
    scales.forEach(scale => {
      const rid = roomIds[scale];
      if (!rid) return;

      // Initial Fetch
      supabase!.from('messages').select('*').eq('room_id', rid).order('timestamp', { ascending: true }).limit(500)
        .then(({ data }) => {
          if (data) {
            setAllMessages(prev => {
              const fetched = data.map((m: any) => ({
                id: m.id, userId: m.user_id, userName: m.user_name || `NODE_${m.user_id.substring(0, 4)}`, userAvatarSeed: m.user_avatar_seed,
                content: m.content, timestamp: new Date(m.timestamp).getTime(), type: m.type
              }));
              const existingIds = new Set(prev[scale].map(m => m.id));
              const newMessages = fetched.filter(m => !existingIds.has(m.id));
              return { ...prev, [scale]: [...prev[scale], ...newMessages].sort((a, b) => a.timestamp - b.timestamp) };
            });
          }
        });

      // Presence & Broadcast
      const channel = supabase!.channel(rid);
      channel.on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        setAllMessages(prev => {
          const existing = prev[scale];
          if (existing.some(m => m.id === payload.id)) return prev;
          return { ...prev, [scale]: [...existing, payload] };
        });
        if (scale !== activeScaleRef.current) {
          setUnreadCounts(prev => ({ ...prev, [scale]: prev[scale] + 1 }));
        }
      });
      channel.subscribe();
      channelsRef.current[rid] = channel;
    });

    return () => {
      Object.values(channelsRef.current).forEach(c => supabase!.removeChannel(c));
      channelsRef.current = {};
    };
  }, [mounted, roomIds]);

  const onSendMessage = async (content: string) => {
    const rid = roomIds[activeScale];
    if (!supabase) {
      console.error('Supabase client not initialized');
      return;
    }
    if (!rid) {
      console.error('No Room ID found for scale:', activeScale);
      return;
    }

    const msg = {
      id: Math.random().toString(36).substring(2, 11),
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatarSeed: currentUser.avatarSeed,
      content,
      timestamp: Date.now(),
      type: 'text'
    };

    // Optimistic Update
    setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], msg as Message] }));

    try {
      // 1. Send to Database
      const { error } = await supabase.from('messages').insert({
        id: msg.id,
        room_id: rid,
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_avatar_seed: currentUser.avatarSeed,
        content,
        timestamp: new Date(msg.timestamp).toISOString(),
        type: 'text'
      });

      if (error) throw error;

      // 2. Broadcast via Realtime (if channel exists)
      if (channelsRef.current[rid]) {
        await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: msg });
      }

    } catch (err) {
      console.error('Message send failed:', err);
      // Rollback optimistic update if needed (optional, effectively just stays local in this simplified version)
      // alert('发送失败，请检查网络'); 
    }
  };

  const onUploadImage = async (file: File) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;

    const tempId = Math.random().toString(36).substring(2, 11);
    const localUrl = URL.createObjectURL(file);
    const tempMsg = {
      id: tempId, userId: currentUser.id, userName: currentUser.name, userAvatarSeed: currentUser.avatarSeed,
      content: localUrl, timestamp: Date.now(), type: 'image'
    };

    // Optimistic update
    setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], tempMsg as Message] }));

    try {
      // Upload to R2
      const result = await uploadImage(file);
      if (!result.success || !result.url) {
        throw new Error(result.error || 'Upload failed');
      }

      const finalMsg = { ...tempMsg, content: result.url };

      // Update local with public URL
      setAllMessages(prev => ({
        ...prev,
        [activeScale]: prev[activeScale].map(m => m.id === tempId ? (finalMsg as Message) : m)
      }));

      // Save to database
      const { error: dbError } = await supabase.from('messages').insert({
        id: tempId, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed,
        content: result.url, timestamp: new Date(finalMsg.timestamp).toISOString(), type: 'image'
      });
      if (dbError) throw dbError;

      // Broadcast
      if (channelsRef.current[rid]) {
        await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: finalMsg });
      }
    } catch (err) {
      console.error('Image upload failed:', err);
      // Rollback
      setAllMessages(prev => ({ ...prev, [activeScale]: prev[activeScale].filter(m => m.id !== tempId) }));
    }
  };

  const onUploadVoice = async (blob: Blob, duration: number) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;

    try {
      // Upload to R2
      const result = await uploadVoice(blob);
      if (!result.success || !result.url) {
        throw new Error(result.error || 'Upload failed');
      }

      const msg = {
        id: Math.random().toString(36).substring(2, 11),
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatarSeed: currentUser.avatarSeed,
        content: result.url,
        timestamp: Date.now(),
        type: 'voice'
      };

      setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], msg as Message] }));

      // Save to database
      const { error: dbError } = await supabase.from('messages').insert({
        id: msg.id, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed,
        content: result.url, timestamp: new Date(msg.timestamp).toISOString(), type: 'voice'
      });
      if (dbError) throw dbError;

      // Broadcast
      if (channelsRef.current[rid]) {
        await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: msg });
      }
    } catch (err) {
      console.error('Voice upload failed:', err);
    }
  };

  if (!mounted) return <div className="h-screen w-screen bg-black" />;

  return (
    <div className="flex h-[100dvh] w-screen bg-black overflow-hidden select-none relative flex-col touch-none">
      {/* Name Input Modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 backdrop-blur-3xl bg-black/60">
          <div className="w-full max-w-sm crystal-black-outer p-8 rounded-[40px] container-rainbow-main flex flex-col gap-6 animate-in zoom-in-95 duration-500">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-black text-white tracking-widest uppercase">身份识别</h2>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">请输入你的数字代号以进入同步</p>
            </div>
            <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                maxLength={12}
                placeholder="在此输入用户名..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none ring-2 ring-transparent focus:ring-white/10 transition-all placeholder:text-white/10"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                className="w-full py-4 bg-white text-black font-black uppercase tracking-[0.3em] rounded-2xl active:scale-[0.98] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
              >
                确认进入
              </button>
              <p className="text-center text-[8px] font-black text-white/15 uppercase tracking-widest">不输入将自动分配随机代号</p>
            </form>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-0">
        <MapWithNoSSR
          initialPosition={[location.lat, location.lng]}
          userLocation={userGps}
          onLocationChange={(loc: any) => { setLocation(loc); setForcedZoom(null); }}
          onMarkerClick={() => setIsChatOpen(true)}
          forcedZoom={forcedZoom}
          fetchActivity={async (la: number, ln: number, z: number) => {
            const scale = getScaleLevel(z);
            if (!chatAnchor) return [];
            const hub = getBucket(chatAnchor[0], chatAnchor[1], scale);
            return [{ id: `hub_${scale}`, lat: hub.lat, lng: hub.lng, type: 'HOTSPOT', label: '' }];
          }}
          onScaleChange={onTabChange}
        />
      </div>

      {/* Settings Button */}
      {!isMobile && (
        <button
          onClick={() => { setTempName(currentUser.name); setShowNameModal(true); }}
          className="fixed left-6 bottom-6 w-12 h-12 crystal-nav-vertical z-[5000] flex items-center justify-center text-white/40 hover:text-white transition-all shadow-xl group"
        >
          <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}

      {/* Left Nav Hidden on Mobile */}
      {!isMobile && (
        <div className="fixed left-6 top-1/2 -translate-y-1/2 w-[72px] h-fit crystal-nav-vertical z-[5000] flex flex-col p-1.5 gap-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
            const isActive = activeScale === tab.value;
            const hasUnread = unreadCounts[tab.value] > 0;
            const themeColor = tab.value === ScaleLevel.DISTRICT ? '#22d3ee' : tab.value === ScaleLevel.CITY ? '#fbbf24' : '#818cf8';
            return (
              <button key={tab.value} onClick={() => onTabChange(tab.value)}
                className={`w-full aspect-square flex flex-col items-center justify-center text-[11px] font-black transition-all duration-700 rounded-xl relative
                      ${isActive ? 'text-white' : 'text-white/10 hover:text-white/20'}`}>
                {isActive && <div className="absolute inset-0 bg-white/5 rounded-xl border border-white/5" />}
                <span className="relative z-10">{tab.label}</span>
                {isActive && (
                  <div className="absolute right-1 w-0.5 h-4 rounded-full"
                    style={{ background: themeColor, boxShadow: `0 0 8px ${themeColor}` }} />
                )}
                {hasUnread && !isActive && (
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile Map Overlays (When chat closed) */}
      {isMobile && !isChatOpen && (
        <div className="fixed inset-x-4 bottom-10 z-[5000] flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
          <div className="w-full max-w-[360px] relative flex items-center justify-center">
            <div className="w-full max-w-[260px] h-12 bg-[#1a1a1a]/90 backdrop-blur-3xl p-1 rounded-full border border-white/10 shadow-2xl flex items-center">
              {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
                const isActive = activeScale === tab.value;
                return (
                  <button key={tab.value}
                    onClick={() => {
                      onTabChange(tab.value);
                      if (userGps) setLocation({ lat: userGps[0], lng: userGps[1], zoom: tab.value === ScaleLevel.DISTRICT ? 14 : tab.value === ScaleLevel.CITY ? 10 : 5 });
                    }}
                    className={`flex-1 h-full rounded-full text-[11px] font-black tracking-widest uppercase transition-all duration-500
                      ${isActive ? 'text-white bg-[#333333] shadow-lg' : 'text-white/20'}`}>
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { setTempName(currentUser.name); setShowNameModal(true); }}
              className="absolute right-0 w-12 h-12 rounded-full bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white/40 hover:text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <div className="w-full max-w-[360px] relative flex items-center justify-center">
            <button
              onClick={() => setIsChatOpen(true)}
              className="w-full max-w-[260px] h-12 bg-[#1a1a1a]/90 backdrop-blur-3xl rounded-full border border-white/10 shadow-2xl flex items-center justify-center text-white font-black uppercase tracking-[0.4em] text-[11px] active:scale-95 transition-all"
            >
              恢复聊天
            </button>
            <button
              onClick={() => {
                if (userGps) {
                  let z = 5; if (activeScale === ScaleLevel.CITY) z = 10; if (activeScale === ScaleLevel.DISTRICT) z = 14;
                  setLocation({ lat: userGps[0], lng: userGps[1], zoom: z });
                  setForcedZoom(z);
                }
              }}
              className="absolute right-0 w-12 h-12 rounded-full bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white/40 hover:text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className={`fixed transition-all duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)] z-[1000] 
            ${(!isMobile || isChatOpen)
          ? (isMobile ? 'top-10 left-4 right-4 bottom-10' : 'top-6 right-6 bottom-6 w-[360px] translate-x-0 opacity-100')
          : (isMobile ? 'translate-y-[120%] opacity-0' : 'top-6 right-6 bottom-6 w-[360px] translate-x-[120%] opacity-0')}`}>
        <ChatInterface
          scale={activeScale}
          roomId={roomIds[activeScale]}
          messages={allMessages[activeScale] || []}
          unreadCounts={unreadCounts}
          user={currentUser}
          onSendMessage={onSendMessage}
          onUploadImage={onUploadImage}
          onUploadVoice={onUploadVoice}
          fetchLiveStreams={async () => []} fetchSharedImages={async () => []}
          isOpen={!isMobile || isChatOpen} onToggle={() => setIsChatOpen(false)} isMobile={isMobile} onTabChange={onTabChange}
        />
      </div>

      <style>{`
        .crystal-nav-vertical { background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 20px; border: 1px solid rgba(255,255,255,0.03); }
        .crystal-nav-vertical::after { content: ""; position: absolute; inset: 0; border-radius: 20px; padding: 1px; background: linear-gradient(180deg, #818cf8, #fbbf24, #22d3ee); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity: 0.15; }
        .crystal-black-outer { background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(40px) saturate(160%); -webkit-backdrop-filter: blur(40px) saturate(160%); }
        .container-rainbow-main { position: relative; border: 1px solid rgba(255, 255, 255, 0.05); }
        .container-rainbow-main::after { content: ""; position: absolute; inset: 0; border-radius: 40px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0.8; z-index: 50; animation: rainbow-drift 6s linear infinite; }
        @keyframes rainbow-drift { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
      `}</style>
    </div>
  );
}
