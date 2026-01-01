import Ably from 'ably';

let ably: Ably.Realtime | null = null;

export const getAblyInstance = () => {
  if (typeof window === 'undefined') return null;
  
  const apiKey = process.env.NEXT_PUBLIC_ABLY_API_KEY;
  if (!apiKey) {
    console.warn('Ably API Key is missing. Real-time features will be disabled.');
    return null;
  }

  if (!ably) {
    ably = new Ably.Realtime({ key: apiKey, clientId: 'anonymous-user' });
  }
  return ably;
};

export const getChannelName = (level: string, location: { country?: string; city?: string } | null) => {
  if (level === 'world') return 'chat:global';
  if (level === 'country') return `chat:country:${location?.country || 'unknown'}`;
  if (level === 'city') return `chat:city:${location?.country || 'unknown'}:${location?.city || 'unknown'}`;
  return 'chat:global';
};
