import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { config } from 'dotenv';
import { spawn } from 'child_process';
import * as http from 'http';
import * as url from 'url';
// @ts-ignore
const { EdgeTTS } = require('@andresaya/edge-tts');

// Загрузка переменных окружения
let configData: any = {};
try {
  const configPath = join(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (configData.TWITCH_CLIENT_ID) process.env.TWITCH_CLIENT_ID = configData.TWITCH_CLIENT_ID;
    if (configData.TWITCH_CLIENT_SECRET) process.env.TWITCH_CLIENT_SECRET = configData.TWITCH_CLIENT_SECRET;
  }
} catch (e) {
  console.error('Ошибка при чтении config.json:', e);
}
config(); // Оставляем на случай разработки

// Путь к файлу с токенами
const TOKEN_FILE = join(app.getPath('userData'), 'twitch_token.json');

// Проверка режима разработки
const isDev = process.env.NODE_ENV === 'development';

// Основное окно приложения
let mainWindow: BrowserWindow | null = null;

// HTTP сервер для авторизации
let authServer: http.Server | null = null;

// Очередь TTS
let ttsQueue: { text: string; voice: string; volume: number }[] = [];
let ttsProcessing = false;

let ttsHttpServer: http.Server | null = null;

// Создание основного окна
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  mainWindow.setMenuBarVisibility(false);

  // Загрузка интерфейса
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../index.html'));
  }

  // Обработка закрытия окна
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Инициализация приложения
app.whenReady().then(() => {
  startTtsHttpServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Настройка IPC обработчиков
  setupIpcHandlers();
});

// Обработка закрытия приложения
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Закрываем TTS HTTP сервер
    if (ttsHttpServer) {
      ttsHttpServer.close(() => {
        ttsHttpServer = null;
      });
    }
    // Закрываем сервер авторизации
    if (authServer) {
      authServer.close(() => {
        authServer = null;
      });
    }
    // Удаляем temp.mp3 если остался
    try {
      fs.unlinkSync(join(process.cwd(), 'temp.mp3'));
    } catch (e) {}
    try {
      fs.unlinkSync(join(process.cwd(), 'temp'));
    } catch (e) {}
    app.quit();
  }
});

// Настройка IPC обработчиков
function setupIpcHandlers() {
  // Получение токена доступа
  ipcMain.handle('get-access-token', async () => {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        const expiresAt = new Date(tokenData.expires_at);
        
        if (new Date() >= expiresAt) {
          if (tokenData.refresh_token) {
            return await refreshAccessToken(tokenData.refresh_token);
          } else {
            throw new Error('Нет refresh токена');
          }
        }
        
        return tokenData.access_token;
      } else {
        throw new Error('Токен не найден');
      }
    } catch (error) {
      console.error('Ошибка при получении токена:', error);
      throw error;
    }
  });

  // Запуск процесса авторизации
  ipcMain.handle('start-auth-process', async () => {
    return new Promise((resolve, reject) => {
      try {
        // Создаем HTTP сервер для получения кода авторизации
        authServer = http.createServer((req, res) => {
          if (req.url && req.url.includes('code=')) {
            const code = req.url.split('code=')[1].split('&')[0];
            
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
              <head>
                <meta charset="utf-8">
                <title>Авторизация успешна</title>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f0f0f0;
                  }
                  .message {
                    text-align: center;
                    padding: 20px;
                    background-color: white;
                    border-radius: 10px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                  }
                </style>
              </head>
              <body>
                <div class="message">
                  <h2>Авторизация успешна!</h2>
                  <p>Вы можете закрыть это окно и вернуться в приложение.</p>
                  <p style="margin: 15px 0; font-size: 16px;"><b style="color: #6441A4;">Поддержать разработчика:</b> <a href="https://boosty.to/mjkey" style="text-decoration: none; color: #FF5C00; transition: color 0.2s;"><b>Boosty</b></a></p>
                </div>
              </body>
              </html>
            `);
            
            // Получаем токены по коду авторизации
            setTokensFromCode(code)
              .then(() => {
                resolve(true);
                if (authServer) {
                  authServer.close();
                  authServer = null;
                }
              })
              .catch(error => {
                reject(error);
              });
          } else {
            res.writeHead(400);
            res.end();
          }
        });
        
        // Запускаем сервер на порту 3777
        authServer.listen(3777, () => {
          // Формируем URL для авторизации
          const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=http://localhost:3777&response_type=code&scope=chat:read`;
          
          // Открываем браузер для авторизации
          shell.openExternal(authUrl);
        });
      } catch (error) {
        reject(error);
      }
    });
  });

  // Добавляем в очередь и запускаем обработку
  ipcMain.handle('speak-text', async (_, text: string, voice: string, volume: number) => {
    console.log('Получено значение громкости:', volume);
    enqueueTTS(text, voice, volume);
    return;
  });
  
  // Получение информации о пользователе
  ipcMain.handle('get-user-info', async (_, token: string) => {
    try {
      const response = await axios.get('https://api.twitch.tv/helix/users', {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID!,
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 200 && response.data.data && response.data.data.length > 0) {
        return {
          login: response.data.data[0].login,
          display_name: response.data.data[0].display_name
        };
      } else {
        throw new Error('Не удалось получить данные пользователя');
      }
    } catch (error) {
      console.error('Ошибка при получении информации о пользователе:', error);
      throw error;
    }
  });
}

// Получение токенов по коду авторизации
async function setTokensFromCode(code: string): Promise<void> {
  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:3777'
      }
    });
    
    if (response.status === 200) {
      const data = response.data;
      const tokenData = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
      };
      
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData));
    } else {
      throw new Error(`Не удалось получить токены: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Ошибка при получении токенов:', error);
    throw error;
  }
}

// Обновление токена доступа
async function refreshAccessToken(refreshToken: string): Promise<string> {
  try {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET
      }
    });
    
    if (response.status === 200) {
      const data = response.data;
      const tokenData = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
      };
      
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData));
      return data.access_token;
    } else {
      throw new Error(`Не удалось обновить токен: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Ошибка при обновлении токена:', error);
    throw error;
  }
}

// Добавляем в очередь и запускаем обработку
function enqueueTTS(text: string, voice: string, volume: number) {
  console.log('Новое сообщение для TTS:', { text, voice, volume });
  
  // Принудительно прерываем текущее воспроизведение и очищаем очередь
  ttsQueue = []; // Очищаем всю очередь
  
  // Если TTS в процессе, отправляем событие audio-played, 
  // чтобы завершить текущее воспроизведение
  if (ttsProcessing) {
    console.log('Прерывание текущего TTS для нового сообщения');
    ttsProcessing = false;
    if (mainWindow) {
      mainWindow.webContents.send('force-stop-audio');
    }
  }
  
  // Добавляем новое сообщение в очередь
  ttsQueue.push({ text, voice, volume });
  processTTSQueue();
}

async function processTTSQueue() {
  if (ttsProcessing || ttsQueue.length === 0) return;
  ttsProcessing = true;
  const { text, voice, volume } = ttsQueue.shift()!;
  console.log('Значение громкости при извлечении из очереди:', volume);
  try {
    await speakText(text, voice, volume);
  } catch (e) {
    console.error('Ошибка TTS:', e);
  }
}

// Озвучка текста через edge-tts
async function speakText(text: string, voice: string, volume: number = 50): Promise<void> {
  console.log('Значение громкости в speakText:', volume);
  console.log('Голос выбран:', voice);
  console.log('Текст для озвучивания:', text);
  
  try {
    // Обрабатываем специальные символы в тексте
    const processedText = processSpecialCharacters(text);
    console.log('Обработанный текст для синтеза:', processedText);
    
    // Проверяем, что текст не пустой после обработки
    if (!processedText.trim()) {
      console.warn('После обработки текст оказался пустым. Пропускаем синтез.');
      ttsProcessing = false;
      if (ttsQueue.length > 0) {
        processTTSQueue();
      }
      return;
    }
    
    // Создаем уникальное имя файла с временной меткой, чтобы избежать кэширования
    const timestamp = Date.now();
    const fileName = `temp_${timestamp}`;
    const file = join(process.cwd(), fileName);
    
    console.log('Генерация аудио с параметрами:', { voice, volume, fileName });
    
    const tts = new EdgeTTS();
    
    // Используем нормальную громкость для генерации звука
    // Громкость будет регулироваться на стороне клиента при воспроизведении
    await tts.synthesize(processedText, voice, {
      rate: '0%',      // Скорость речи (диапазон: -100% до 100%)
      volume: '0%',    // Используем нормальную громкость для TTS
      pitch: '0Hz'     // Высота голоса (диапазон: -100Hz до 100Hz)
    });
    
    await tts.toFile(file);
    if (mainWindow) {
      // Добавляем к URL параметр с временной меткой для избежания кэширования
      const audioUrl = `http://localhost:3778/${fileName}.mp3?t=${timestamp}`;
      console.log('Отправка события play-audio с URL:', audioUrl);
      mainWindow.webContents.send('play-audio', audioUrl);
    }
    await new Promise<void>((resolve) => {
      // Однократная подписка на событие audio-played
      const audioPlayedHandler = () => {
        try {
          fs.unlinkSync(file + '.mp3');
          console.log('Файл удален:', file + '.mp3');
        } catch (e) {
          console.error('Ошибка при удалении файла:', e);
        }
        ttsProcessing = false;
        if (ttsQueue.length > 0) {
          processTTSQueue();
        }
        // Удаляем обработчик, чтобы избежать повторного вызова
        ipcMain.removeListener('audio-played', audioPlayedHandler);
        resolve();
      };
      
      ipcMain.once('audio-played', audioPlayedHandler);
    });
  } catch (e) {
    console.error('Ошибка TTS:', e);
    
    // Если произошла ошибка, отправляем сообщение в интерфейс
    if (mainWindow) {
      mainWindow.webContents.send('tts-error', {
        message: 'Ошибка при синтезе речи',
        details: e.message || 'Неизвестная ошибка'
      });
    }
    
    ttsProcessing = false;
    if (ttsQueue.length > 0) {
      processTTSQueue();
    }
    throw e;
  }
}

// Функция для обработки специальных символов в тексте
function processSpecialCharacters(text: string): string {
  // Заменяем специальные символы на их текстовые эквиваленты
  let processedText = text;
  
  // Сначала обрабатываем комбинации символов и эмодзи
  processedText = processedText
    // Сердечки и эмоции
    .replace(/<3/g, ' сердечко ')
    .replace(/♥/g, ' сердечко ')
    .replace(/<\/3/g, ' разбитое сердце ')
    // Текстовые смайлики
    .replace(/:3/g, ' котик ')
    .replace(/:\)/g, ' улыбка ')
    .replace(/:\(/g, ' грустно ')
    .replace(/:\|/g, ' нейтрально ')
    .replace(/XD/gi, ' смеюсь ')
    .replace(/;\)/g, ' подмигиваю ')
    .replace(/:\*/g, ' целую ')
    .replace(/:\//g, ' смущаюсь ')
    .replace(/:D/g, ' очень радуюсь ')
    .replace(/:P/gi, ' показываю язык ')
    .replace(/\^_\^/g, ' счастлив ')
    .replace(/о\//g, ' машу рукой ')
    .replace(/\\о/g, ' машу рукой ')
    // Текстовые выражения
    .replace(/lol/gi, ' лол ')
    .replace(/rofl/gi, ' рофл ')
    .replace(/omg/gi, ' о боже ')
    .replace(/wtf/gi, ' вотэфэ ');
  
  // Затем заменяем отдельные специальные символы
  processedText = processedText
    .replace(/</g, ' меньше чем ')
    .replace(/>/g, ' больше чем ')
    .replace(/&/g, ' и ')
    .replace(/=/g, ' равно ')
    .replace(/\+/g, ' плюс ')
    .replace(/-/g, ' минус ')
    .replace(/\*/g, ' звёздочка ')
    .replace(/\//g, ' дробь ')
    .replace(/\\/g, ' обратная дробь ')
    .replace(/\|/g, ' вертикальная черта ')
    .replace(/@/g, ' собачка ')
    .replace(/%/g, ' процент ')
    .replace(/#/g, ' решётка ');
  
  return processedText;
}

function startTtsHttpServer() {
  if (ttsHttpServer) return;
  ttsHttpServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    
    // Проверяем, что это запрос MP3 файла
    if (pathname.endsWith('.mp3')) {
      // Извлекаем имя файла из пути
      const filename = pathname.substring(1); // Убираем начальный слеш
      const filePath = join(process.cwd(), filename);
      
      console.log('Запрос файла:', filename, 'Полный URL:', req.url);
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          console.error('Ошибка чтения файла:', err);
          res.writeHead(404);
          res.end();
        } else {
          // Отправляем файл с заголовками для предотвращения кэширования
          res.writeHead(200, { 
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
          console.log('Отправка аудио файла:', filename, 'размер:', data.length, 'байт');
          res.end(data);
        }
      });
    } else {
      console.log('Неизвестный запрос:', req.url);
      res.writeHead(404);
      res.end();
    }
  });
  
  ttsHttpServer.on('error', (err) => {
    console.error('Ошибка HTTP сервера:', err);
  });
  
  ttsHttpServer.listen(3778, () => {
    console.log('TTS HTTP сервер запущен на порту 3778');
  });
} 