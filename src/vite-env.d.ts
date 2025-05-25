/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    getAccessToken: () => Promise<string>;
    startAuthProcess: () => Promise<boolean>;
    speakText: (text: string, voice: string, volume: number) => Promise<void>;
    onPlayAudio: (callback: (file: string) => void) => () => void;
    sendAudioPlayed: () => void;
    getUserInfo: (token: string) => Promise<{ login: string; display_name: string; }>;
    onForceStopAudio: (callback: () => void) => () => void;
    onTtsError: (callback: (error: { message: string; details: string }) => void) => () => void;
  }
} 