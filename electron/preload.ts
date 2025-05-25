import { contextBridge, ipcRenderer } from 'electron';

// Экспортируем API для использования в рендерере
contextBridge.exposeInMainWorld('electronAPI', {
  // Получение токена доступа
  getAccessToken: async (): Promise<string> => {
    return await ipcRenderer.invoke('get-access-token');
  },
  
  // Запуск процесса авторизации
  startAuthProcess: async (): Promise<boolean> => {
    return await ipcRenderer.invoke('start-auth-process');
  },
  
  // Озвучка текста
  speakText: async (text: string, voice: string, volume: number): Promise<void> => {
    return await ipcRenderer.invoke('speak-text', text, voice, volume);
  },

  // Подписка на событие воспроизведения аудио
  onPlayAudio: (callback: (file: string) => void) => {
    // Сначала удаляем все существующие слушатели, чтобы избежать дублирования
    ipcRenderer.removeAllListeners('play-audio');
    // Затем добавляем новый слушатель
    ipcRenderer.on('play-audio', (_, file) => callback(file));
    
    // Возвращаем функцию для отписки, если это потребуется
    return () => {
      ipcRenderer.removeAllListeners('play-audio');
    };
  },

  sendAudioPlayed: () => {
    ipcRenderer.send('audio-played');
  },
  
  // Подписка на событие принудительной остановки аудио
  onForceStopAudio: (callback: () => void) => {
    // Сначала удаляем все существующие слушатели, чтобы избежать дублирования
    ipcRenderer.removeAllListeners('force-stop-audio');
    // Затем добавляем новый слушатель
    ipcRenderer.on('force-stop-audio', () => callback());
    
    // Возвращаем функцию для отписки, если это потребуется
    return () => {
      ipcRenderer.removeAllListeners('force-stop-audio');
    };
  },
  
  // Подписка на событие ошибки TTS
  onTtsError: (callback: (error: { message: string; details: string }) => void) => {
    // Сначала удаляем все существующие слушатели, чтобы избежать дублирования
    ipcRenderer.removeAllListeners('tts-error');
    // Затем добавляем новый слушатель
    ipcRenderer.on('tts-error', (_, error) => callback(error));
    
    // Возвращаем функцию для отписки, если это потребуется
    return () => {
      ipcRenderer.removeAllListeners('tts-error');
    };
  },
  
  // Получение информации о пользователе
  getUserInfo: async (token: string): Promise<{ login: string; display_name: string }> => {
    return await ipcRenderer.invoke('get-user-info', token);
  }
}); 