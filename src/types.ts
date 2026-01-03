export enum ScaleLevel {
    DISTRICT = 'DISTRICT', // Zoom 13
    CITY = 'CITY',       // Zoom 10
    WORLD = 'WORLD'      // Zoom 4
}

export type SubTabType = 'CHAT' | 'IMAGES';
export type ThemeType = 'dark' | 'light';

export interface User {
    id: string;
    avatarSeed: string;
    name: string;
    countryCode?: string;
    isGM?: boolean;
}

export interface Message {
    id: string;
    userId: string;
    userName: string;
    userAvatarSeed: string;
    content: string; // Text or Emoji
    timestamp: number;
    type: 'text' | 'emoji' | 'voice' | 'image';
    countryCode?: string;
    isRecalled?: boolean;
    isGM?: boolean;
    replyTo?: {
        userName: string;
        content: string;
    };
    voiceDuration?: number;
}

export interface RoomStats {
    occupancy: number;
    activityLevel: 'low' | 'medium' | 'high';
}

export interface AIAtmosphere {
    mood: string;
    summary: string;
    keywords: string[];
    color: string; // Hex code suggesting mood
}

export interface LocationState {
    lat: number;
    lng: number;
    zoom: number;
}

export interface ActivityMarker {
    id: string;
    lat: number;
    lng: number;
    type: 'USER' | 'HOTSPOT' | 'CENTROID';
    intensity?: number; // 0-1
    label?: string;
}

export interface LiveStream {
    id: string;
    hostName: string;
    title: string;
    listeners: number;
    tags: string[];
    lat: number;
    lng: number;
}

export interface SharedImage {
    id: string;
    url: string;
    caption: string;
    author: string;
    likes: number;
    lat: number;
    lng: number;
    timestamp: number;
}

export interface UserPresence {
    user_id: string;
    user_name: string;
    avatarSeed: string;
    lat: number;
    lng: number;
    onlineAt: number;
    isGM?: boolean;
    isTyping?: boolean;
    lastReadTimestamp?: number;
}

export interface Suggestion {
    id: string;
    user_id: string;
    user_name: string;
    content: string;
    timestamp: string;
}
