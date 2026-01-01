'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ChatInterface } from '@/components/ChatInterface';
import { LocationState, Message, User, ScaleLevel, ActivityMarker, ThemeType } from '@/types';
import { getRoomId, getScaleLevel, getBucket, BUCKET_SIZES, getLocationName, getCountryCode } from '@/lib/spatialService';
import { uploadImage, uploadVoice } from '@/lib/r2Storage';
import dynamic from 'next/dynamic';
import * as h3 from 'h3-js';

const MapWithNoSSR = dynamic(
  () => import('@/components/MapBackground').then((mod) => mod.MapBackground),
  { ssr: false, loading: () => <div className="h-screen w-screen bg-black flex items-center justify-center text-white/5 font-black tracking-[0.5em] uppercase">Initializing Spatial System...</div> }
);

const GUEST_USER: User = { id: 'guest', avatarSeed: 'default', name: '游客' };

const RANDOM_NAMES = ['流浪的小星', '极光行者', '深海潜航', '赛博诗人', '夜幕幽灵', '霓虹信使', '虚空观察者', '重力叛逆者', '光速速递', '量子纠缠', '云端漫步', '像素浪人', '磁卡狂热', '电子蝴蝶', '光谱漫游', '暗物质', '临界点', '高维度', '波函数', '奇点降临'];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<User>(GUEST_USER);
  const [showUnifiedSettings, setShowUnifiedSettings] = useState(false);
  const [tempName, setTempName] = useState('');

  // Initial Location
  const [location, setLocation] = useState<LocationState>({ lat: 35.8617, lng: 104.1954, zoom: 5 });
  const [activeScale, setActiveScale] = useState<ScaleLevel>(ScaleLevel.WORLD);
  const [userGps, setUserGps] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [forcedZoom, setForcedZoom] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [locationName, setLocationName] = useState<string>('');
  const [theme, setTheme] = useState<ThemeType>('dark');

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
      setShowUnifiedSettings(true);
      setCurrentUser({ id, avatarSeed: seed, name: '游客' });
    } else {
      setCurrentUser({ id, avatarSeed: seed, name: storedName });
    }

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    checkMobile();

    const storedTheme = localStorage.getItem('whisper_theme') as ThemeType;
    if (storedTheme) setTheme(storedTheme);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSettingsSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const finalName = tempName.trim() || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];

    const worldChannel = channelsRef.current['world_global'];
    if (worldChannel) {
      const state = worldChannel.presenceState();
      const isTaken = Object.values(state).flat().some((p: any) => p.user?.name === finalName && p.user?.id !== currentUser.id);
      if (isTaken) {
        alert('该代号已被在线特工占用，请换一个。');
        return;
      }
    }

    const newUser = { ...currentUser, name: finalName };
    setCurrentUser(newUser);
    localStorage.setItem('whisper_user_name', finalName);
    localStorage.setItem('whisper_theme', theme);
    setShowUnifiedSettings(false);
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
          const cc = getCountryCode(latitude, longitude);
          setCurrentUser(prev => ({ ...prev, countryCode: cc }));
        },
        () => {
          setChatAnchor([35.8617, 104.1954]);
          setIsLocating(false);
        }
      );
    } else {
      setChatAnchor([35.8617, 104.1954]);
      setIsLocating(false);
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !chatAnchor) return;
    const dRoomId = getRoomId(ScaleLevel.DISTRICT, chatAnchor[0], chatAnchor[1]);
    const cRoomId = getRoomId(ScaleLevel.CITY, chatAnchor[0], chatAnchor[1]);
    const wRoomId = 'world_global';
    setRoomIds(prev => {
      if (prev[ScaleLevel.DISTRICT] === dRoomId && prev[ScaleLevel.CITY] === cRoomId) return prev;
      return { [ScaleLevel.DISTRICT]: dRoomId, [ScaleLevel.CITY]: cRoomId, [ScaleLevel.WORLD]: wRoomId };
    });
    getLocationName(chatAnchor[0], chatAnchor[1], activeScale).then(setLocationName);
  }, [chatAnchor, mounted, activeScale]);

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
    if (chatAnchor) setLocation({ lat: chatAnchor[0], lng: chatAnchor[1], zoom: z });
  };

  useEffect(() => {
    if (!mounted || !supabase) return;
    const scales = [ScaleLevel.DISTRICT, ScaleLevel.CITY, ScaleLevel.WORLD];
    scales.forEach(scale => {
      const rid = roomIds[scale];
      if (!rid) return;

      supabase!.from('messages').select('*').eq('room_id', rid).order('timestamp', { ascending: true }).limit(500)
        .then(({ data }) => {
          if (data) {
            setAllMessages(prev => {
              const fetched = data.map((m: any) => ({
                id: m.id, userId: m.user_id, userName: m.user_name || `NODE_${m.user_id.substring(0, 4)}`, userAvatarSeed: m.user_avatar_seed,
                content: m.content, timestamp: new Date(m.timestamp).getTime(), type: m.type, countryCode: m.country_code
              }));
              const existingIds = new Set(prev[scale].map(m => m.id));
              const newMessages = fetched.filter(m => !existingIds.has(m.id));
              return { ...prev, [scale]: [...prev[scale], ...newMessages].sort((a, b) => a.timestamp - b.timestamp) };
            });
          }
        });

      const channel = supabase!.channel(rid);
      channel.on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        setAllMessages(prev => {
          const existing = prev[scale];
          if (existing.some(m => m.id === payload.id)) return prev;
          return { ...prev, [scale]: [...existing, payload] };
        });
        if (scale !== activeScaleRef.current) setUnreadCounts(prev => ({ ...prev, [scale]: prev[scale] + 1 }));
      })
        .on('presence', { event: 'sync' }, () => { })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track({ user: currentUser });
        });
      channelsRef.current[rid] = channel;
    });

    return () => {
      Object.values(channelsRef.current).forEach(c => supabase!.removeChannel(c));
      channelsRef.current = {};
    };
  }, [mounted, roomIds, currentUser]);

  const onSendMessage = async (content: string) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;
    const msg = {
      id: Math.random().toString(36).substring(2, 11),
      userId: currentUser.id, userName: currentUser.name, userAvatarSeed: currentUser.avatarSeed,
      content, timestamp: Date.now(), type: 'text' as const, countryCode: currentUser.countryCode
    };
    setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], msg] }));
    try {
      const { error } = await supabase.from('messages').insert({
        id: msg.id, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed,
        content, timestamp: new Date(msg.timestamp).toISOString(), type: 'text'
      });
      if (error) throw error;
      if (channelsRef.current[rid]) await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: msg });
    } catch (err) { console.error('Message send failed:', err); }
  };

  const onUploadImage = async (file: File) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;
    const tempId = Math.random().toString(36).substring(2, 11);
    const localUrl = URL.createObjectURL(file);
    const tempMsg = {
      id: tempId, userId: currentUser.id, userName: currentUser.name, userAvatarSeed: currentUser.avatarSeed,
      content: localUrl, timestamp: Date.now(), type: 'image' as const, countryCode: currentUser.countryCode
    };
    setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], tempMsg] }));
    try {
      const result = await uploadImage(file);
      if (!result.success || !result.url) throw new Error(result.error);
      const finalMsg = { ...tempMsg, content: result.url };
      setAllMessages(prev => ({ ...prev, [activeScale]: prev[activeScale].map(m => m.id === tempId ? finalMsg : m) }));
      const { error: dbError } = await supabase.from('messages').insert({
        id: tempId, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed,
        content: result.url, timestamp: new Date(finalMsg.timestamp).toISOString(), type: 'image'
      });
      if (dbError) throw dbError;
      if (channelsRef.current[rid]) await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: finalMsg });
    } catch (err) {
      console.error('Image upload failed:', err);
      setAllMessages(prev => ({ ...prev, [activeScale]: prev[activeScale].filter(m => m.id !== tempId) }));
    }
  };

  const onUploadVoice = async (blob: Blob, duration: number) => {
    const rid = roomIds[activeScale];
    if (!supabase || !rid) return;
    try {
      const result = await uploadVoice(blob);
      if (!result.success || !result.url) throw new Error(result.error);
      const msg = {
        id: Math.random().toString(36).substring(2, 11),
        userId: currentUser.id, userName: currentUser.name, userAvatarSeed: currentUser.avatarSeed,
        content: result.url, timestamp: Date.now(), type: 'voice' as const, countryCode: currentUser.countryCode
      };
      setAllMessages(prev => ({ ...prev, [activeScale]: [...prev[activeScale], msg] }));
      const { error: dbError } = await supabase.from('messages').insert({
        id: msg.id, room_id: rid, user_id: currentUser.id, user_name: currentUser.name, user_avatar_seed: currentUser.avatarSeed,
        content: result.url, timestamp: new Date(msg.timestamp).toISOString(), type: 'voice'
      });
      if (dbError) throw dbError;
      if (channelsRef.current[rid]) await channelsRef.current[rid].send({ type: 'broadcast', event: 'chat-message', payload: msg });
    } catch (err) { console.error('Voice upload failed:', err); }
  };

  if (!mounted) return <div className="h-screen w-screen bg-black" />;

  return (
    <div className="flex h-[100dvh] w-screen bg-black overflow-hidden select-none relative flex-col touch-none">

      {showUnifiedSettings && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 backdrop-blur-3xl bg-black/80">
          <div className="absolute inset-0" onClick={() => currentUser.name !== '游客' && setShowUnifiedSettings(false)} />
          <div className="w-full max-w-sm crystal-black-outer p-8 rounded-[40px] container-rainbow-main flex flex-col gap-8 animate-in zoom-in-95 duration-500 relative">

            {currentUser.name !== '游客' && (
              <button
                onClick={() => setShowUnifiedSettings(false)}
                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/30 hover:text-white transition-all z-50 border border-white/5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}

            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-black text-white tracking-widest uppercase">身份识别 / 设置</h2>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">昵称与主题</p>
            </div>

            <form onSubmit={handleSettingsSubmit} className="flex flex-col gap-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black tracking-widest text-white/40 uppercase block px-1">显示昵称</label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="在此输入用户名..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none ring-2 ring-transparent focus:ring-white/10 transition-all placeholder:text-white/10"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-black tracking-[0.2em] text-white/30 uppercase px-1">视觉界面</h3>
                <div className="grid grid-cols-2 gap-3 select-none">
                  <div onClick={() => setTheme('dark')} className={`p-4 rounded-2xl border flex flex-col gap-3 cursor-pointer transition-all active:scale-95 ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/5 opacity-50 hover:opacity-80'}`}>
                    <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
                    <span className="text-[9px] font-black tracking-widest uppercase text-white/60">深邃终端 (Dark)</span>
                  </div>
                  <div onClick={() => setTheme('light')} className={`p-4 rounded-2xl border flex flex-col gap-3 cursor-pointer transition-all active:scale-95 ${theme === 'light' ? 'bg-white border-white text-black' : 'bg-transparent border-white/5 opacity-50 hover:opacity-80'}`}>
                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm" />
                    <span className={`text-[9px] font-black tracking-widest uppercase ${theme === 'light' ? 'text-black/60' : 'text-white/20'}`}>明亮棱镜 (Light)</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-4">
                <button
                  type="submit"
                  className="w-full py-4 bg-white text-black font-black uppercase tracking-[0.3em] rounded-2xl active:scale-[0.98] transition-all hover:shadow-[0_0_30_px_rgba(255,255,255,0.3)] shadow-xl"
                >
                  保存设置
                </button>
                <p className="text-center text-[8px] font-black text-white/15 uppercase tracking-widest">不输入将自动分配随机代号</p>
              </div>
            </form>


          </div>
        </div>
      )}

      <div className="absolute inset-0 z-0">
        <MapWithNoSSR
          initialPosition={[location.lat, location.lng]}
          userLocation={userGps}
          onLocationChange={(loc: any) => { setLocation(loc); setForcedZoom(null); }}
          onMarkerClick={(m: ActivityMarker) => {
            setChatAnchor([m.lat, m.lng]);
            setIsChatOpen(true);
          }}
          forcedZoom={forcedZoom}
          fetchActivity={async (la: number, ln: number, z: number) => {
            if (!supabase) return [];
            const scale = getScaleLevel(z);
            if (scale === ScaleLevel.WORLD) return [];

            const prefix = scale.toLowerCase();
            const { data, error } = await supabase
              .from('messages')
              .select('room_id')
              .like('room_id', `${prefix}_%`);

            if (error || !data) return [];

            const uniqueRooms = Array.from(new Set(data.map(d => d.room_id)));
            return uniqueRooms.map(rid => {
              const h3Index = rid.split('_')[1];
              try {
                const [lat, lng] = h3.cellToLatLng(h3Index);
                return { id: rid, lat, lng };
              } catch (e) {
                return null;
              }
            }).filter(Boolean) as ActivityMarker[];
          }}
          onScaleChange={onTabChange}
          theme={theme}
        />
      </div>

      {!isMobile && (
        <div className="fixed left-6 bottom-6 flex flex-col gap-4 z-[5000]">
          <button
            onClick={() => {
              if (userGps) {
                let z = 5; if (activeScale === ScaleLevel.CITY) z = 10; if (activeScale === ScaleLevel.DISTRICT) z = 14;
                setLocation({ lat: userGps[0], lng: userGps[1], zoom: z });
                setForcedZoom(z);
                setChatAnchor([userGps[0], userGps[1]]);
              }
            }}
            className={`w-12 h-12 crystal-nav-vertical flex items-center justify-center transition-all shadow-xl group ${theme === 'light' ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white'}`}
            title="定位我的位置"
          >

            <svg className="w-5 h-5 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg>
          </button>
          <button
            onClick={() => { setTempName(currentUser.name === '游客' ? '' : currentUser.name); setShowUnifiedSettings(true); }}
            className={`w-12 h-12 crystal-nav-vertical flex items-center justify-center transition-all shadow-xl group ${theme === 'light' ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white'}`}
            title="修改个人设置"
          >
            <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      )}

      {!isMobile && (
        <div className="fixed left-6 top-1/2 -translate-y-1/2 w-[72px] h-fit crystal-nav-vertical z-[5000] flex flex-col p-1.5 gap-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
            const isActive = activeScale === tab.value;
            const hasUnread = unreadCounts[tab.value] > 0;
            const themeColor = tab.value === ScaleLevel.DISTRICT ? '#22d3ee' : tab.value === ScaleLevel.CITY ? '#fbbf24' : '#818cf8';
            return (
              <button key={tab.value} onClick={() => onTabChange(tab.value)}
                className={`w-full aspect-square flex flex-col items-center justify-center text-[11px] font-black transition-all duration-700 rounded-xl relative
                      ${isActive ? (theme === 'light' ? 'text-gray-900' : 'text-white') : (theme === 'light' ? 'text-black/20 hover:text-black/40' : 'text-white/10 hover:text-white/20')}`}>
                {isActive && <div className={`absolute inset-0 rounded-xl border ${theme === 'light' ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'}`} />}
                <span className="relative z-10">{tab.label}</span>
                {isActive && <div className="absolute right-1 w-0.5 h-4 rounded-full" style={{ background: themeColor, boxShadow: `0 0 8px ${themeColor}` }} />}
                {hasUnread && !isActive && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]" />}
              </button>
            );
          })}
        </div>
      )}

      {isMobile && !isChatOpen && (
        <div className="fixed inset-x-4 bottom-10 z-[5000] flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
          <div className="w-full max-w-[360px] relative flex items-center justify-center">
            <div className="w-full max-w-[260px] h-12 bg-[#1a1a1a]/90 backdrop-blur-3xl p-1 rounded-full border border-white/10 shadow-2xl flex items-center">
              {[{ label: '世界', value: ScaleLevel.WORLD }, { label: '城市', value: ScaleLevel.CITY }, { label: '地区', value: ScaleLevel.DISTRICT }].map(tab => {
                const isActive = activeScale === tab.value;
                return (
                  <button key={tab.value} onClick={() => onTabChange(tab.value)} className={`flex-1 h-full rounded-full text-[11px] font-black tracking-widest uppercase transition-all duration-500 ${isActive ? 'text-white bg-[#333333] shadow-lg' : 'text-white/20'}`}>{tab.label}</button>
                );
              })}
            </div>
            <button onClick={() => { setTempName(currentUser.name === '游客' ? '' : currentUser.name); setShowUnifiedSettings(true); }} className="absolute right-0 w-12 h-12 rounded-full bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white/40 hover:text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
          <div className="w-full max-w-[360px] relative flex items-center justify-center">
            <button onClick={() => setIsChatOpen(true)} className="w-full max-w-[260px] h-12 bg-[#1a1a1a]/90 backdrop-blur-3xl rounded-full border border-white/10 shadow-2xl flex items-center justify-center text-white font-black uppercase tracking-[0.4em] text-[11px] active:scale-95 transition-all">恢复聊天</button>
            <button onClick={() => { if (userGps) { let z = 5; if (activeScale === ScaleLevel.CITY) z = 10; if (activeScale === ScaleLevel.DISTRICT) z = 14; setLocation({ lat: userGps[0], lng: userGps[1], zoom: z }); setForcedZoom(z); setChatAnchor([userGps[0], userGps[1]]); } }} className="absolute right-0 w-12 h-12 rounded-full bg-[#1a1a1a]/90 backdrop-blur-3xl border border-white/10 text-white/40 hover:text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg></button>
          </div>
        </div>
      )}

      <div className={`fixed transition-all duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)] z-[1000] 
            ${(!isMobile || isChatOpen) ? (isMobile ? 'top-10 left-4 right-4 bottom-10' : 'top-6 right-6 bottom-6 w-[360px] translate-x-0 opacity-100') : (isMobile ? 'translate-y-[120%] opacity-0' : 'top-6 right-6 bottom-6 w-[360px] translate-x-[120%] opacity-0')}`}>
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
          locationName={locationName}
          onOpenSettings={() => { setTempName(currentUser.name === '游客' ? '' : currentUser.name); setShowUnifiedSettings(true); }}
          onUpdateUser={(data) => {
            if (data.name) {
              const newUser = { ...currentUser, name: data.name };
              setCurrentUser(newUser);
              localStorage.setItem('whisper_user_name', data.name);
            }
          }}
          theme={theme}
        />
      </div>

      <style>{`
        .crystal-nav-vertical { position: relative; background: ${theme === 'light' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)'}; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 20px; border: 1.5px solid transparent; }
        .crystal-nav-vertical::after { content: ""; position: absolute; inset: 0; border-radius: 20px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0.8; z-index: 10; animation: rainbow-drift 6s linear infinite; }
        .crystal-black-outer { background: ${theme === 'light' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.35)'}; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .container-rainbow-main { position: relative; border: 1px solid ${theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255, 255, 255, 0.05)'}; }
        .container-rainbow-main::after { content: ""; position: absolute; inset: 0; border-radius: 40px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: 0.8; z-index: 50; animation: rainbow-drift 6s linear infinite; }
        .bubble-rainbow { position: relative; background: ${theme === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(26, 26, 26, 0.5)'} !important; backdrop-filter: blur(12px); border-radius: 20px; }
        .bubble-rainbow::before { content: ""; position: absolute; inset: 0; border-radius: 20px; padding: 1.5px; background: linear-gradient(135deg, #22d3ee, #fbbf24, #f472b6, #818cf8); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; z-index: 10; animation: rainbow-drift 6s linear infinite; }
        .bubble-rainbow > * { position: relative; z-index: 1; }
        @keyframes rainbow-drift { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
        @keyframes wave-bounce { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.5); } }
        .animate-wave-bounce { animation: wave-bounce 0.6s ease-in-out infinite; transform-origin: bottom; }
      `}</style>
    </div>
  );
}
