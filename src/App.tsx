import React, { useState, useEffect, useRef } from 'react';
import { Client } from 'tmi.js';

// Тип данных для сообщения чата
interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
  isTTS: boolean;
  isModerator: boolean;
  isVip: boolean;
  inQueue?: boolean; // Флаг для отслеживания сообщений в очереди TTS
}

// Доступные голоса
const VOICE_OPTIONS = [
  { value: 'ru-RU-SvetlanaNeural', label: 'Светлана' },
  { value: 'ru-RU-DmitryNeural', label: 'Дмитрий' },
  { value: 'random', label: 'Рандомный голос' }
];

const App: React.FC = () => {
  // Состояния
  const [channel, setChannel] = useState<string>('');
  const [ttsQueue, setTtsQueue] = useState<ChatMessage[]>([]); // Очередь TTS сообщений
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ttsPrefix, setTtsPrefix] = useState<string>('>>');
  const [selectedVoice, setSelectedVoice] = useState<string>(VOICE_OPTIONS[0].value);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [ttsOnlyModerators, setTtsOnlyModerators] = useState<boolean>(true);
  const [ttsVipAllowed, setTtsVipAllowed] = useState<boolean>(false);
  const [ttsVolume, setTtsVolume] = useState<number>(50);
  
  // Ссылки
  const clientRef = useRef<Client | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedVoiceRef = useRef(selectedVoice);
  const ttsVolumeRef = useRef(ttsVolume);
  const ttsOnlyModeratorsRef = useRef(ttsOnlyModerators);
  const ttsVipAllowedRef = useRef(ttsVipAllowed);
  
  // Прокрутка чата вниз при появлении новых сообщений
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Проверка авторизации при запуске
  useEffect(() => {
    checkAuth();
  }, []);
  
  // Проверка авторизации
  const checkAuth = async () => {
    try {
      const accessToken = await window.electronAPI.getAccessToken();
      setIsAuthorized(true);
      
      // Получаем имя пользователя
      try {
        const userData = await window.electronAPI.getUserInfo(accessToken);
        if (userData && userData.login) {
          setChannel(userData.login);
        }
      } catch (userError) {
        console.error('Ошибка получения данных пользователя:', userError);
      }
    } catch (error) {
      setIsAuthorized(false);
    }
  };
  
  // Процесс авторизации
  const handleAuth = async () => {
    try {
      await window.electronAPI.startAuthProcess();
      setIsAuthorized(true);
    } catch (error) {
      console.error('Ошибка авторизации:', error);
    }
  };
  
  // Подключение к чату
  const connectToChat = async () => {
    if (!channel.trim() || isConnecting) return;
    
    setIsConnecting(true);
    
    try {
      // Отключаемся от текущего клиента, если он существует
      if (clientRef.current) {
        await clientRef.current.disconnect();
        clientRef.current = null;
      }
      
      // Создаем нового клиента
      const client = new Client({
        channels: [channel]
      });
      
      // Обработчик сообщений
      client.on('message', (_channel, tags, message, _self) => {
        const username = tags['display-name'] || tags.username || 'anonymous';
        const id = tags.id || Date.now().toString();
        const timestamp = new Date();
        const isTTS = message.startsWith(ttsPrefix);
        // Определяем, является ли пользователь модератором
        const isModerator = !!(tags.mod || (tags.badges && tags.badges.moderator === '1'));
        // Определяем, является ли пользователь VIP
        const isVip = !!(tags.badges && tags.badges.vip === '1');
        
        // Добавляем сообщение в список
        setMessages(prev => [...prev, { id, username, message, timestamp, isTTS, isModerator, isVip }]);
        
        // Если сообщение начинается с префикса TTS
        if (isTTS) {
          // Проверяем разрешения пользователя
          const canUseTTS = 
            (ttsOnlyModeratorsRef.current && isModerator) || 
            (ttsOnlyModeratorsRef.current && ttsVipAllowedRef.current && isVip) ||
            !ttsOnlyModeratorsRef.current;
          
          if (!canUseTTS) {
            console.log(`Сообщение пропущено: пользователь ${username} не имеет прав на TTS (модератор: ${isModerator}, VIP: ${isVip})`);
            return;
          }
          
          const textToSpeak = message.substring(ttsPrefix.length).trim();
          if (textToSpeak) {
            // Выбираем голос
            let voice = selectedVoiceRef.current;
            if (voice === 'random') {
              const realVoices = VOICE_OPTIONS.slice(0, 2);
              voice = realVoices[Math.floor(Math.random() * realVoices.length)].value;
            }
            
            // Добавляем сообщение в очередь TTS
            const ttsMessage = { id, username, message, timestamp, isTTS, isModerator, isVip, inQueue: true };
            setTtsQueue(prev => [...prev, ttsMessage]);
            
            console.log(`Отправка сообщения TTS от ${username}${isModerator ? ' (модератор)' : ''}${isVip ? ' (VIP)' : ''} с голосом ${voice} и громкостью ${ttsVolumeRef.current}`);
            window.electronAPI.speakText(textToSpeak, voice, ttsVolumeRef.current);
          }
        }
      });
      
      // Обработчик подключения
      client.on('connected', () => {
        setIsConnected(true);
        setIsConnecting(false);
      });
      
      // Обработчик отключения
      client.on('disconnected', () => {
        setIsConnected(false);
        setIsConnecting(false);
      });
      
      // Подключаемся к серверу
      await client.connect();
      
      // Сохраняем клиент в ссылке
      clientRef.current = client;
    } catch (error) {
      console.error('Ошибка подключения:', error);
      setIsConnected(false);
      setIsConnecting(false);
    }
  };
  
  // Отключение от чата
  const disconnectFromChat = async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
        clientRef.current = null;
        setIsConnected(false);
      } catch (error) {
        console.error('Ошибка отключения:', error);
      }
    }
  };
  
  // Обработчик формы
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConnected) {
      disconnectFromChat();
    } else {
      connectToChat();
    }
  };
  
  // Воспроизведение mp3 по событию из main process
  useEffect(() => {
    let currentAudio: HTMLAudioElement | null = null;
    let lastProcessedUrl: string | null = null;
    
    console.log('Настройка обработчиков аудио');

    // Обработчик окончания воспроизведения для обновления очереди
    const handleAudioEnded = () => {
      setTtsQueue(prev => {
        const newQueue = [...prev];
        newQueue.shift(); // Удаляем первое сообщение из очереди
        return newQueue;
      });
    };
    
    // Подписываемся на события и сохраняем функции отписки
    const unsubscribePlayAudio = window.electronAPI.onPlayAudio((file) => {
      console.log('Получен файл для воспроизведения:', file);
      
      // Проверяем, не обрабатываем ли мы тот же самый URL повторно
      if (lastProcessedUrl === file) {
        console.log('Игнорирую повторный запрос на воспроизведение того же файла');
        return;
      }
      
      // Запоминаем URL
      lastProcessedUrl = file;
      
      // Останавливаем предыдущее аудио, если оно играет
      if (currentAudio) {
        console.log('Остановка предыдущего аудио');
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.remove(); // Полное удаление элемента
        currentAudio = null;
      }
      
      // Создаем новый аудио элемент с параметром времени для предотвращения кэширования
      const audio = new Audio(`${file}&nocache=${Date.now()}`);
      
      // Устанавливаем громкость для воспроизведения (от 0.0 до 1.0)
      // Преобразуем диапазон 0-100 в 0.0-1.0
      audio.volume = ttsVolumeRef.current / 100;
      console.log('Установлена громкость воспроизведения:', audio.volume);
      
      currentAudio = audio;
      
      // Создаем обработчик окончания воспроизведения
      const onEnded = () => {
        console.log('Аудио воспроизведение завершено');
        window.electronAPI.sendAudioPlayed();
        audio.removeEventListener('ended', onEnded);
        if (currentAudio === audio) {
          currentAudio = null;
          // Сбрасываем lastProcessedUrl только если это было последнее аудио
          lastProcessedUrl = null;
        }
        // Обновляем очередь после завершения воспроизведения
        handleAudioEnded();
      };
      
      // Обработчик ошибки воспроизведения
      const onError = (e: Event) => {
        console.error('Ошибка воспроизведения аудио:', e);
        window.electronAPI.sendAudioPlayed(); // Сообщаем, что воспроизведение завершено, чтобы очистить файлы
        audio.removeEventListener('error', onError);
        // Сбрасываем lastProcessedUrl в случае ошибки
        if (lastProcessedUrl === file) {
          lastProcessedUrl = null;
        }
      };
      
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      
      // Начинаем воспроизведение
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.error('Ошибка при воспроизведении:', err);
          // Сбрасываем lastProcessedUrl в случае ошибки
          if (lastProcessedUrl === file) {
            lastProcessedUrl = null;
          }
        });
      }
    });
    
    // Подписываемся на событие принудительной остановки
    const unsubscribeForceStopAudio = window.electronAPI.onForceStopAudio(() => {
      console.log('Получена команда принудительной остановки аудио');
      if (currentAudio) {
        console.log('Принудительная остановка аудио');
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.remove();
        currentAudio = null;
        // Сбрасываем lastProcessedUrl при принудительной остановке
        lastProcessedUrl = null;
        window.electronAPI.sendAudioPlayed(); // Сообщаем, что воспроизведение завершено
      }
    });
    
    // Подписываемся на события ошибок TTS
    const unsubscribeTtsError = window.electronAPI.onTtsError((error) => {
      console.error('Получена ошибка TTS:', error);
      
      // Здесь можно показать уведомление пользователю об ошибке
      const errorDiv = document.createElement('div');
      errorDiv.style.position = 'fixed';
      errorDiv.style.bottom = '20px';
      errorDiv.style.right = '20px';
      errorDiv.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
      errorDiv.style.color = 'white';
      errorDiv.style.padding = '10px 20px';
      errorDiv.style.borderRadius = '5px';
      errorDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
      errorDiv.style.zIndex = '9999';
      errorDiv.style.maxWidth = '300px';
      
      errorDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">${error.message}</div>
        <div style="font-size: 0.9em;">${error.details}</div>
      `;
      
      document.body.appendChild(errorDiv);
      
      // Удаляем уведомление через 5 секунд
      setTimeout(() => {
        if (document.body.contains(errorDiv)) {
          document.body.removeChild(errorDiv);
        }
      }, 5000);
    });
    
    // Очистка при размонтировании
    return () => {
      console.log('Отписка от обработчиков аудио');
      
      // Отписываемся от всех событий
      unsubscribePlayAudio();
      unsubscribeForceStopAudio();
      unsubscribeTtsError();
      
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.remove();
        currentAudio = null;
      }
      lastProcessedUrl = null;
    };
  }, []);
  
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  useEffect(() => {
    ttsVolumeRef.current = ttsVolume;
    console.log('Значение громкости изменено:', ttsVolume);
  }, [ttsVolume]);

  useEffect(() => {
    ttsOnlyModeratorsRef.current = ttsOnlyModerators;
  }, [ttsOnlyModerators]);
  
  useEffect(() => {
    ttsVipAllowedRef.current = ttsVipAllowed;
  }, [ttsVipAllowed]);
  
  // Тестовая функция для проверки громкости
  const testVolume = () => {
    // Выбираем голос по той же логике, что и в основной функции
    let voice = selectedVoice;
    let voiceName = '';
    
    if (voice === 'random') {
      // Если выбран "random", выбираем только между реальными голосами
      const realVoices = VOICE_OPTIONS.slice(0, 2);
      const randomVoiceIndex = Math.floor(Math.random() * realVoices.length);
      voice = realVoices[randomVoiceIndex].value;
      voiceName = realVoices[randomVoiceIndex].label;
    } else {
      voiceName = VOICE_OPTIONS.find(v => v.value === voice)?.label || voice;
    }
    
    console.log(`Тестирование громкости: ${ttsVolume}%, голос: ${voiceName}`);
    window.electronAPI.speakText(`Тест громкости ${ttsVolume} процентов, голос ${voiceName}`, voice, ttsVolume);
  };
  
  // Добавляем стили для индикатора очереди и бейджа
  const styles = `
    .tts-queue-indicator {
      background: rgba(100, 65, 164, 0.1);
      border-radius: 8px;
      padding: 10px;
      margin: 10px 0;
    }

    .tts-queue-indicator h3 {
      margin: 0 0 10px 0;
      color: #6441A4;
    }

    .tts-queue-list {
      max-height: 150px;
      overflow-y: auto;
    }

    .tts-queue-item {
      padding: 5px;
      border-bottom: 1px solid rgba(100, 65, 164, 0.2);
      font-size: 0.9em;
    }

    .queue-badge {
      background: #6441A4;
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.8em;
      margin-left: 8px;
    }
  `;

  return (
    <div className="container">
      <style>{styles}</style>
      <div className="header">
        <h1>Twitch Chat TTS</h1>
      </div>
      
      {!isAuthorized ? (
        <div className="settings-panel">
          <h2 className="settings-title">Авторизация</h2>
          <p>Необходимо авторизоваться через Twitch для работы приложения.</p>
          <button onClick={handleAuth}>Авторизоваться через Twitch</button>
        </div>
      ) : (
        <>
          <div className="settings-panel">
            <h2 className="settings-title">Настройки подключения</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="channel">Канал Twitch</label>
                <input
                  type="text"
                  id="channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="Введите имя канала"
                  disabled={isConnected || isConnecting}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="ttsPrefix">Префикс для TTS</label>
                <input
                  type="text"
                  id="ttsPrefix"
                  value={ttsPrefix}
                  onChange={(e) => setTtsPrefix(e.target.value)}
                  placeholder="Например: >>"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="voice">Голос</label>
                <select
                  id="voice"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                >
                  {VOICE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="volume">Громкость TTS: {ttsVolume}%</label>
                <input
                  type="range"
                  id="volume"
                  min="0"
                  max="100"
                  value={ttsVolume}
                  onChange={(e) => setTtsVolume(parseInt(e.target.value))}
                />
                <button 
                  type="button" 
                  onClick={testVolume} 
                  style={{ marginTop: '5px', width: 'auto', padding: '5px 10px' }}
                >
                  Тест громкости
                </button>
              </div>

              <div className="form-group permissions-group">
                <label style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <input
                    type="checkbox"
                    checked={ttsOnlyModerators}
                    onChange={e => setTtsOnlyModerators(e.target.checked)}
                  />
                  Озвучивать только сообщения модераторов
                </label>
                
                {ttsOnlyModerators && (
                  <label style={{display:'flex',alignItems:'center',gap:'8px', marginTop: '8px', marginLeft: '25px'}}>
                    <input
                      type="checkbox"
                      checked={ttsVipAllowed}
                      onChange={e => setTtsVipAllowed(e.target.checked)}
                    />
                    + VIP-пользователи
                  </label>
                )}
              </div>
              
              <button type="submit" disabled={isConnecting || !channel.trim()}>
                {isConnected ? 'Отключиться' : isConnecting ? 'Подключение...' : 'Подключиться'}
              </button>
            </form>
          </div>
          
          <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? `Подключено к каналу: ${channel}` : 'Не подключено'}
          </div>
          
          <>
            {/* Индикатор очереди TTS */}
            {ttsQueue.length > 0 && (
              <div className="tts-queue-indicator">
                <h3>Очередь TTS ({ttsQueue.length})</h3>
                <div className="tts-queue-list">
                  {ttsQueue.map((msg, index) => (
                    <div key={msg.id} className="tts-queue-item">
                      {index + 1}. {msg.username}: {msg.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="chat-container">
              {messages.map(msg => (
                <div key={msg.id} className={`chat-message${msg.isTTS ? ' tts-message' : ''}`}>
                  <span className="username">{msg.username}:</span>
                  <span className="content">{msg.message}</span>
                  {msg.inQueue && <span className="queue-badge">В очереди</span>}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        </>
      )}
    </div>
  );
};

export default App;