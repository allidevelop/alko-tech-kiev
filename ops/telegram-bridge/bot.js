/**
 * Alko Technics - Telegram <-> Claude Code Bridge
 *
 * Проект: alko_technics
 *
 * Функционал:
 * - Полное управление Claude Code через Telegram
 * - Все режимы работы (safe, danger, plan, acceptEdits)
 * - MCP серверы
 * - Выбор модели (sonnet, opus, haiku)
 * - Интерактивные подтверждения
 * - Управление сессиями
 * - Отправка изображений и файлов
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// Пути
const BRIDGE_DIR = __dirname;
const PROJECT_DIR = path.join(BRIDGE_DIR, '..', '..');
const IMAGES_DIR = path.join(BRIDGE_DIR, 'received_images');
const VOICE_DIR = path.join(BRIDGE_DIR, 'received_voice');
const OUTGOING_DIR = path.join(BRIDGE_DIR, 'outgoing_files');
const SCREENSHOTS_DIR = path.join(BRIDGE_DIR, 'screenshots');
const ENV_FILE = path.join(PROJECT_DIR, '.env');
const STATE_FILE = path.join(BRIDGE_DIR, 'state.json');
const REMINDERS_FILE = path.join(BRIDGE_DIR, 'reminders.json');
const LAST_IMAGE_FILE = path.join(BRIDGE_DIR, 'last_image.txt');
const PID_FILE = path.join(BRIDGE_DIR, 'bot.pid');

// Защита от повторного запуска
function checkSingleInstance() {
    if (fs.existsSync(PID_FILE)) {
        const oldPid = fs.readFileSync(PID_FILE, 'utf8').trim();
        try {
            // Проверяем жив ли процесс
            process.kill(parseInt(oldPid), 0);
            console.error(`Бот уже запущен (PID: ${oldPid}). Выход.`);
            process.exit(1);
        } catch (e) {
            // Процесс мёртв, можно продолжать
        }
    }
    // Записываем свой PID
    fs.writeFileSync(PID_FILE, process.pid.toString());

    // Удаляем PID файл при выходе
    process.on('exit', () => {
        try { fs.unlinkSync(PID_FILE); } catch (e) {}
    });
    process.on('SIGINT', () => process.exit());
    process.on('SIGTERM', () => process.exit());
}

checkSingleInstance();

// Загрузка конфигурации
const config = loadConfig();
const BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_IDS = config.ALLOWED_CHAT_IDS; // Массив разрешённых chat_id
const BOT_USERNAME = config.BOT_USERNAME || null; // @username бота для упоминаний в группах

// Состояние
let state = loadState();
let claudeProcess = null;
let outputBuffer = '';
let waitingForInput = false;
let lastOutputTime = 0;

function loadConfig() {
    const envConfig = {};
    if (fs.existsSync(ENV_FILE)) {
        fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(line => {
            const match = line.match(/^([^#=]+)=(.*)$/);
            if (match) envConfig[match[1].trim()] = match[2].trim();
        });
    }

    // Поддержка нескольких chat_id через запятую или массив
    // TELEGRAM_CHAT_ID=123,456,789 или TELEGRAM_ALLOWED_CHAT_IDS=123,456,789
    const chatIdStr = envConfig.TELEGRAM_ALLOWED_CHAT_IDS || envConfig.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
    const allowedChatIds = chatIdStr.split(',').map(id => id.trim()).filter(id => id);

    return {
        TELEGRAM_BOT_TOKEN: envConfig.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
        ALLOWED_CHAT_IDS: allowedChatIds,
        BOT_USERNAME: envConfig.TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || null
    };
}

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) {}
    return {
        sessionId: null,
        permissionMode: 'default', // default, bypassPermissions, plan, acceptEdits, dontAsk
        model: 'claude-opus-4-5-20251101',  // opus 4.5 по умолчанию
        autoApprove: false,
        systemPrompt: null,
        // Контекст
        contextUsed: 0,
        contextWindow: 200000,
        lastCost: 0,
        totalCost: 0
    };
}

function saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// Проверка конфигурации
if (!BOT_TOKEN || ALLOWED_CHAT_IDS.length === 0) {
    console.error('Ошибка: TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID обязательны!');
    process.exit(1);
}

// Функция проверки разрешённого chat_id
function isAllowedChat(chatId) {
    return ALLOWED_CHAT_IDS.includes(chatId.toString());
}

// Получение информации о боте (для username)
let botInfo = null;
async function getBotInfo() {
    if (botInfo) return botInfo;

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/getMe`,
            method: 'GET'
        };
        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.ok) {
                        botInfo = result.result;
                        resolve(botInfo);
                    } else {
                        reject(new Error(result.description));
                    }
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
if (!fs.existsSync(VOICE_DIR)) {
    fs.mkdirSync(VOICE_DIR, { recursive: true });
}
if (!fs.existsSync(OUTGOING_DIR)) {
    fs.mkdirSync(OUTGOING_DIR, { recursive: true });
}
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Напоминания
let reminders = loadReminders();

function loadReminders() {
    try {
        if (fs.existsSync(REMINDERS_FILE)) {
            return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveReminders() {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf8');
}

// ============ Image Management ============

/**
 * Записывает путь к последнему полученному изображению для Claude
 */
function saveLastImagePath(imagePath) {
    fs.writeFileSync(LAST_IMAGE_FILE, imagePath, 'utf8');
    console.log(`[IMAGE] Last image saved: ${imagePath}`);
}

/**
 * Получает путь к последнему полученному изображению
 */
function getLastImagePath() {
    if (fs.existsSync(LAST_IMAGE_FILE)) {
        const path = fs.readFileSync(LAST_IMAGE_FILE, 'utf8').trim();
        if (fs.existsSync(path)) {
            return path;
        }
    }
    return null;
}

/**
 * Делает скриншот экрана и возвращает путь
 * Поддерживает: gnome-screenshot, scrot, import (ImageMagick)
 * Fallback: генерирует информационное изображение через Python PIL
 */
function takeScreenshot(filename = null, text = null) {
    const timestamp = Date.now();
    const screenshotName = filename || `screenshot_${timestamp}.png`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);

    // Пробуем разные инструменты для скриншота экрана
    const tools = [
        { cmd: 'gnome-screenshot', args: ['-f', screenshotPath] },
        { cmd: 'scrot', args: [screenshotPath] },
        { cmd: 'import', args: ['-window', 'root', screenshotPath] }
    ];

    for (const tool of tools) {
        try {
            execSync(`which ${tool.cmd}`, { stdio: 'ignore' });
            execSync(`${tool.cmd} ${tool.args.join(' ')}`, {
                timeout: 10000,
                env: { ...process.env, DISPLAY: ':0' }
            });

            if (fs.existsSync(screenshotPath)) {
                console.log(`[SCREENSHOT] Created with ${tool.cmd}: ${screenshotPath}`);
                return screenshotPath;
            }
        } catch (e) {
            continue;
        }
    }

    // Fallback: генерируем информационное изображение через Python PIL
    try {
        const infoText = text || `Screenshot from Claude Code\\n${new Date().toISOString()}`;
        const pythonScript = `
from PIL import Image, ImageDraw
import datetime

img = Image.new('RGB', (800, 400), color=(30, 30, 40))
draw = ImageDraw.Draw(img)

# Текст
text = """${infoText.replace(/"/g, '\\"')}"""
draw.text((40, 150), text, fill=(200, 200, 255))
draw.text((40, 30), 'Claude Code - Telegram Bridge', fill=(100, 255, 100))
draw.text((40, 350), datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), fill=(150, 150, 150))

img.save('${screenshotPath}')
`;
        execSync(`python3 -c "${pythonScript.replace(/\n/g, '; ')}"`, {
            cwd: SCREENSHOTS_DIR,
            timeout: 5000
        });

        if (fs.existsSync(screenshotPath)) {
            console.log(`[SCREENSHOT] Created with PIL: ${screenshotPath}`);
            return screenshotPath;
        }
    } catch (e) {
        console.error(`[SCREENSHOT] PIL fallback error: ${e.message}`);
    }

    return null;
}

/**
 * Создаёт изображение с текстом и отправляет в Telegram
 * Для отправки информации/данных визуально
 */
function createInfoImage(text, filename = null) {
    const timestamp = Date.now();
    const imageName = filename || `info_${timestamp}.png`;
    const imagePath = path.join(SCREENSHOTS_DIR, imageName);

    try {
        const escapedText = text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        const pythonScript = `
from PIL import Image, ImageDraw
import datetime
import textwrap

# Размер изображения зависит от текста
lines = textwrap.wrap("""${escapedText}""", width=80)
height = max(400, 50 + len(lines) * 20 + 50)
img = Image.new('RGB', (900, height), color=(25, 25, 35))
draw = ImageDraw.Draw(img)

# Заголовок
draw.text((20, 15), 'Claude Code Output', fill=(100, 200, 255))

# Основной текст
y = 50
for line in lines:
    draw.text((20, y), line, fill=(220, 220, 220))
    y += 20

# Время
draw.text((20, height - 30), datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), fill=(100, 100, 100))

img.save('${imagePath}')
`;
        execSync(`python3 -c "${pythonScript.replace(/\n/g, '; ')}"`, {
            cwd: SCREENSHOTS_DIR,
            timeout: 5000
        });

        if (fs.existsSync(imagePath)) {
            console.log(`[INFO IMAGE] Created: ${imagePath}`);
            return imagePath;
        }
    } catch (e) {
        console.error(`[INFO IMAGE] Error: ${e.message}`);
    }

    return null;
}

/**
 * Извлекает маркер скриншота из текста Claude
 * Формат: <!-- TELEGRAM_SCREENSHOT -->optional_filename<!-- /TELEGRAM_SCREENSHOT -->
 */
function extractTelegramScreenshot(text) {
    const regex = /<!--\s*TELEGRAM_SCREENSHOT\s*-->([\s\S]*?)<!--\s*\/TELEGRAM_SCREENSHOT\s*-->/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        const filename = match[1].trim() || null;
        matches.push(filename);
    }

    const cleanText = text.replace(/<!--\s*TELEGRAM_SCREENSHOT\s*-->[\s\S]*?<!--\s*\/TELEGRAM_SCREENSHOT\s*-->/g, '').trim();

    return matches.length > 0 ? { screenshots: matches, cleanText } : null;
}

/**
 * Извлекает маркер запроса последнего изображения
 * Формат: <!-- TELEGRAM_GET_LAST_IMAGE --><!-- /TELEGRAM_GET_LAST_IMAGE -->
 */
function extractTelegramGetLastImage(text) {
    const regex = /<!--\s*TELEGRAM_GET_LAST_IMAGE\s*-->[\s\S]*?<!--\s*\/TELEGRAM_GET_LAST_IMAGE\s*-->/g;
    const hasMarker = regex.test(text);
    const cleanText = text.replace(regex, '').trim();

    return hasMarker ? { cleanText } : null;
}

/**
 * Извлекает маркер для браузерного скриншота через Chrome DevTools MCP
 * Формат: <!-- TELEGRAM_BROWSER_SCREENSHOT -->optional_caption<!-- /TELEGRAM_BROWSER_SCREENSHOT -->
 */
function extractBrowserScreenshot(text) {
    const regex = /<!--\s*TELEGRAM_BROWSER_SCREENSHOT\s*-->([\s\S]*?)<!--\s*\/TELEGRAM_BROWSER_SCREENSHOT\s*-->/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1].trim() || 'Скриншот браузера');
    }

    const cleanText = text.replace(/<!--\s*TELEGRAM_BROWSER_SCREENSHOT\s*-->[\s\S]*?<!--\s*\/TELEGRAM_BROWSER_SCREENSHOT\s*-->/g, '').trim();

    return matches.length > 0 ? { captions: matches, cleanText } : null;
}

/**
 * Извлекает маркер для создания информационного изображения
 * Формат: <!-- TELEGRAM_INFO_IMAGE -->текст для изображения<!-- /TELEGRAM_INFO_IMAGE -->
 */
function extractInfoImage(text) {
    const regex = /<!--\s*TELEGRAM_INFO_IMAGE\s*-->([\s\S]*?)<!--\s*\/TELEGRAM_INFO_IMAGE\s*-->/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        const content = match[1].trim();
        if (content) {
            matches.push(content);
        }
    }

    const cleanText = text.replace(/<!--\s*TELEGRAM_INFO_IMAGE\s*-->[\s\S]*?<!--\s*\/TELEGRAM_INFO_IMAGE\s*-->/g, '').trim();

    return matches.length > 0 ? { texts: matches, cleanText } : null;
}

// ============ Telegram API ============

// Текущий chat_id для ответов (устанавливается при получении сообщения)
let currentChatId = ALLOWED_CHAT_IDS[0];

function setCurrentChat(chatId) {
    currentChatId = chatId.toString();
}

function sendMessage(text, keyboard = null, chatId = null) {
    const targetChatId = chatId || currentChatId;
    return new Promise((resolve, reject) => {
        const MAX_LENGTH = 4000;
        const messages = [];

        if (text.length <= MAX_LENGTH) {
            messages.push(text);
        } else {
            let remaining = text;
            while (remaining.length > 0) {
                if (remaining.length <= MAX_LENGTH) {
                    messages.push(remaining);
                    break;
                }
                let cutPoint = remaining.lastIndexOf('\n', MAX_LENGTH);
                if (cutPoint === -1 || cutPoint < MAX_LENGTH / 2) cutPoint = MAX_LENGTH;
                messages.push(remaining.substring(0, cutPoint));
                remaining = remaining.substring(cutPoint).trimStart();
            }
        }

        (async () => {
            for (let i = 0; i < messages.length; i++) {
                const isLast = i === messages.length - 1;
                const part = messages[i];
                const prefix = messages.length > 1 ? `[${i + 1}/${messages.length}]\n` : '';
                await sendSingleMessage(prefix + part, isLast ? keyboard : null, targetChatId);
                if (!isLast) await new Promise(r => setTimeout(r, 100));
            }
            resolve();
        })().catch(reject);
    });
}

function sendSingleMessage(text, keyboard = null, chatId = null) {
    const targetChatId = chatId || currentChatId;
    return new Promise((resolve, reject) => {
        // Конвертируем Markdown в HTML для Telegram
        const htmlText = markdownToTelegramHtml(text);
        const payload = {
            chat_id: targetChatId,
            text: htmlText,
            parse_mode: 'HTML'
        };

        if (keyboard) {
            payload.reply_markup = {
                keyboard: keyboard,
                resize_keyboard: true,
                one_time_keyboard: true
            };
        }

        const data = Buffer.from(JSON.stringify(payload), 'utf8');
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (!result.ok) console.error('[SEND ERROR]', result.description);
                } catch (e) {}
                resolve(body);
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function getUpdates(offset = 0) {
    return new Promise((resolve, reject) => {
        // Явно указываем все типы обновлений включая голосовые
        const allowedUpdates = JSON.stringify(["message", "callback_query", "edited_message"]);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30&allowed_updates=${encodeURIComponent(allowedUpdates)}`,
            method: 'GET'
        };
        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function getFilePath(fileId) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/getFile?file_id=${fileId}`,
            method: 'GET'
        };
        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.ok) resolve(result.result.file_path);
                    else reject(new Error(result.description));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function downloadFile(filePath, localPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/file/bot${BOT_TOKEN}/${filePath}`,
            method: 'GET'
        };
        const req = https.request(options, res => {
            const fileStream = fs.createWriteStream(localPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve(localPath);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ============ Telegram Send Files API ============

/**
 * Отправляет фото в Telegram
 */
function sendPhoto(photoPath, caption = '', chatId = null) {
    const targetChatId = chatId || currentChatId;
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(photoPath)) {
            reject(new Error(`File not found: ${photoPath}`));
            return;
        }

        const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
        const fileName = path.basename(photoPath);
        const fileContent = fs.readFileSync(photoPath);

        let body = '';
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${targetChatId}\r\n`;

        if (caption) {
            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
        }

        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="photo"; filename="${fileName}"\r\n`;
        body += `Content-Type: image/${path.extname(fileName).slice(1) || 'png'}\r\n\r\n`;

        const bodyStart = Buffer.from(body, 'utf8');
        const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
        const data = Buffer.concat([bodyStart, fileContent, bodyEnd]);

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendPhoto`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': data.length
            }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (!result.ok) {
                        console.error('[SEND PHOTO ERROR]', result.description);
                        reject(new Error(result.description));
                    } else {
                        console.log('[PHOTO] Sent successfully');
                        resolve(result);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Отправляет документ/файл в Telegram
 */
function sendDocument(filePath, caption = '', chatId = null) {
    const targetChatId = chatId || currentChatId;
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            reject(new Error(`File not found: ${filePath}`));
            return;
        }

        const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
        const fileName = path.basename(filePath);
        const fileContent = fs.readFileSync(filePath);

        let body = '';
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${targetChatId}\r\n`;

        if (caption) {
            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
        }

        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n`;
        body += `Content-Type: application/octet-stream\r\n\r\n`;

        const bodyStart = Buffer.from(body, 'utf8');
        const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
        const data = Buffer.concat([bodyStart, fileContent, bodyEnd]);

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendDocument`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': data.length
            }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (!result.ok) {
                        console.error('[SEND DOC ERROR]', result.description);
                        reject(new Error(result.description));
                    } else {
                        console.log('[DOC] Sent successfully');
                        resolve(result);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Извлекает маркер отправки изображения из ответа Claude
 * Формат: <!-- TELEGRAM_SEND_IMAGE -->/path/to/image.png<!-- /TELEGRAM_SEND_IMAGE -->
 */
function extractTelegramImage(text) {
    const regex = /<!--\s*TELEGRAM_SEND_IMAGE\s*-->([\s\S]*?)<!--\s*\/TELEGRAM_SEND_IMAGE\s*-->/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        const filePath = match[1].trim();
        if (filePath) {
            matches.push(filePath);
        }
    }

    const cleanText = text.replace(/<!--\s*TELEGRAM_SEND_IMAGE\s*-->[\s\S]*?<!--\s*\/TELEGRAM_SEND_IMAGE\s*-->/g, '').trim();

    return matches.length > 0 ? { images: matches, cleanText } : null;
}

/**
 * Извлекает маркер отправки файла из ответа Claude
 * Формат: <!-- TELEGRAM_SEND_FILE -->/path/to/file.txt<!-- /TELEGRAM_SEND_FILE -->
 */
function extractTelegramFile(text) {
    const regex = /<!--\s*TELEGRAM_SEND_FILE\s*-->([\s\S]*?)<!--\s*\/TELEGRAM_SEND_FILE\s*-->/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        const filePath = match[1].trim();
        if (filePath) {
            matches.push(filePath);
        }
    }

    const cleanText = text.replace(/<!--\s*TELEGRAM_SEND_FILE\s*-->[\s\S]*?<!--\s*\/TELEGRAM_SEND_FILE\s*-->/g, '').trim();

    return matches.length > 0 ? { files: matches, cleanText } : null;
}

/**
 * Извлекает маркер напоминания из ответа Claude
 * Формат: <!-- TELEGRAM_REMINDER -->{"delay_minutes": 5, "message": "текст"}<!-- /TELEGRAM_REMINDER -->
 */
function extractTelegramReminder(text) {
    const regex = /<!--\s*TELEGRAM_REMINDER\s*-->([\s\S]*?)<!--\s*\/TELEGRAM_REMINDER\s*-->/g;
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        try {
            const data = JSON.parse(match[1].trim());
            if (data.delay_minutes && data.message) {
                matches.push(data);
            }
        } catch (e) {
            console.error('[REMINDER PARSE ERROR]', e.message);
        }
    }

    const cleanText = text.replace(/<!--\s*TELEGRAM_REMINDER\s*-->[\s\S]*?<!--\s*\/TELEGRAM_REMINDER\s*-->/g, '').trim();

    return matches.length > 0 ? { reminders: matches, cleanText } : null;
}

/**
 * Создаёт напоминание
 */
function createReminder(delayMinutes, message) {
    const triggerTime = Date.now() + delayMinutes * 60 * 1000;
    const reminder = {
        id: `rem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        triggerTime,
        message,
        created: Date.now()
    };

    reminders.push(reminder);
    saveReminders();

    console.log(`[REMINDER] Created: "${message}" in ${delayMinutes} min`);
    return reminder;
}

/**
 * Проверяет и отправляет сработавшие напоминания
 */
async function checkReminders() {
    const now = Date.now();
    const triggered = reminders.filter(r => r.triggerTime <= now);

    for (const reminder of triggered) {
        await sendMessage(`⏰ Напоминание:\n\n${reminder.message}`);
        console.log(`[REMINDER] Triggered: "${reminder.message}"`);
    }

    if (triggered.length > 0) {
        reminders = reminders.filter(r => r.triggerTime > now);
        saveReminders();
    }
}

// ============ Telegram Poll API (Inline Keyboard) ============

/**
 * Отправляет сообщение с Inline Keyboard
 */
function sendInlineKeyboard(text, buttons, chatId = null) {
    const targetChatId = chatId || currentChatId;
    return new Promise((resolve, reject) => {
        const htmlText = markdownToTelegramHtml(text);
        const payload = {
            chat_id: targetChatId,
            text: htmlText,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons
            }
        };

        const data = Buffer.from(JSON.stringify(payload), 'utf8');
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (!result.ok) {
                        console.error('[INLINE KB ERROR]', result.description);
                        reject(new Error(result.description));
                    } else {
                        resolve(result);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Подтверждает callback_query (убирает спиннер на кнопке)
 */
function answerCallbackQuery(callbackQueryId, text = null) {
    return new Promise((resolve, reject) => {
        const payload = { callback_query_id: callbackQueryId };
        if (text) payload.text = text;

        const data = Buffer.from(JSON.stringify(payload), 'utf8');
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/answerCallbackQuery`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Редактирует текст сообщения (для обновления после выбора)
 */
function editMessageText(messageId, newText, removeKeyboard = true, chatId = null) {
    const targetChatId = chatId || currentChatId;
    return new Promise((resolve, reject) => {
        const htmlText = markdownToTelegramHtml(newText);
        const payload = {
            chat_id: targetChatId,
            message_id: messageId,
            text: htmlText,
            parse_mode: 'HTML'
        };

        if (removeKeyboard) {
            payload.reply_markup = { inline_keyboard: [] };
        }

        const data = Buffer.from(JSON.stringify(payload), 'utf8');
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/editMessageText`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (!result.ok) {
                        console.error('[EDIT MSG ERROR]', result.description);
                    }
                    resolve(result);
                } catch (e) {
                    resolve(body);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ============ Poll Logic ============

/**
 * Извлекает данные опроса из ответа Claude
 */
function extractTelegramPoll(text) {
    const regex = /<!--\s*TELEGRAM_POLL\s*-->([\s\S]*?)<!--\s*\/TELEGRAM_POLL\s*-->/;
    const match = text.match(regex);
    if (!match) return null;

    try {
        const pollData = JSON.parse(match[1].trim());
        const cleanText = text.replace(regex, '').trim();

        // Валидация обязательных полей
        if (!pollData.question || !Array.isArray(pollData.options) || pollData.options.length === 0) {
            console.error('[POLL PARSE] Missing required fields');
            return null;
        }

        // Генерируем poll_id если не указан
        if (!pollData.poll_id) {
            pollData.poll_id = `poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        return { pollData, cleanText };
    } catch (e) {
        console.error('[POLL PARSE ERROR]', e.message);
        return null;
    }
}

/**
 * Формирует кнопки для опроса
 */
function buildPollButtons(pollData, selected = []) {
    const { options, allow_custom = true, poll_id, multiple = false } = pollData;

    const buttons = options.map((opt, idx) => {
        const isSelected = selected.includes(idx);
        const prefix = multiple ? (isSelected ? '✅ ' : '⬜ ') : '';
        return [{
            text: prefix + opt,
            callback_data: `poll:${poll_id}:${idx}`
        }];
    });

    // Для множественного выбора добавляем кнопку "Готово"
    if (multiple && selected.length > 0) {
        buttons.push([{
            text: '✅ Готово (отправить)',
            callback_data: `poll:${poll_id}:done`
        }]);
    }

    // Добавляем кнопку "Свой вариант" если разрешено
    if (allow_custom !== false) {
        buttons.push([{
            text: '✏️ Свой вариант',
            callback_data: `poll:${poll_id}:custom`
        }]);
    }

    return buttons;
}

/**
 * Отправляет опрос в Telegram через Inline Keyboard
 */
async function sendPoll(pollData) {
    const { question, options, allow_custom = true, poll_id, multiple = false } = pollData;

    console.log(`[POLL] Sending poll: ${poll_id}, multiple: ${multiple}`);

    const buttons = buildPollButtons(pollData, []);

    try {
        const result = await sendInlineKeyboard(question, buttons);

        // Сохраняем состояние опроса
        state.pendingPoll = {
            pollId: poll_id,
            question: question,
            options: options,
            messageId: result.result?.message_id,
            chatId: currentChatId, // Сохраняем chat_id для ответа
            timestamp: Date.now(),
            waitingForCustomInput: false,
            multiple: multiple,
            allowCustom: allow_custom,
            selected: [] // для множественного выбора
        };
        saveState();

        console.log(`[POLL] Sent successfully, messageId: ${state.pendingPoll.messageId}`);
    } catch (e) {
        console.error('[POLL ERROR]', e.message);
        await sendMessage(`❌ Ошибка отправки опроса: ${e.message}\n\nВопрос: ${question}\nОтветь текстом.`);
    }
}

/**
 * Обновляет сообщение с кнопками опроса
 */
async function updatePollMessage() {
    if (!state.pendingPoll || !state.pendingPoll.messageId) return;

    const pollData = {
        options: state.pendingPoll.options,
        allow_custom: state.pendingPoll.allowCustom,
        poll_id: state.pendingPoll.pollId,
        multiple: state.pendingPoll.multiple
    };

    const buttons = buildPollButtons(pollData, state.pendingPoll.selected);
    const selectedNames = state.pendingPoll.selected.map(i => state.pendingPoll.options[i]);
    const selectionText = selectedNames.length > 0
        ? `\n\n📋 Выбрано: ${selectedNames.join(', ')}`
        : '';

    const targetChatId = state.pendingPoll.chatId || currentChatId;
    const payload = {
        chat_id: targetChatId,
        message_id: state.pendingPoll.messageId,
        text: state.pendingPoll.question + selectionText,
        reply_markup: { inline_keyboard: buttons }
    };

    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/editMessageText`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': data.length
        }
    };

    return new Promise((resolve) => {
        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        });
        req.on('error', () => resolve(null));
        req.write(data);
        req.end();
    });
}

/**
 * Обрабатывает callback_query от нажатия на Inline кнопку
 */
async function handleCallbackQuery(callbackQuery) {
    const data = callbackQuery.data;
    const callbackQueryId = callbackQuery.id;

    console.log(`[CALLBACK] Received: ${data}`);

    // Парсим callback_data: "poll:uuid:index" или "poll:uuid:custom" или "poll:uuid:done"
    const match = data.match(/^poll:([^:]+):(.+)$/);
    if (!match) {
        await answerCallbackQuery(callbackQueryId, '❌ Неизвестный callback');
        return;
    }

    const [, pollId, choice] = match;

    // Проверяем что опрос существует и ID совпадает
    if (!state.pendingPoll || state.pendingPoll.pollId !== pollId) {
        await answerCallbackQuery(callbackQueryId, '❌ Опрос устарел');
        return;
    }

    // Подтверждаем получение callback (убираем спиннер)
    await answerCallbackQuery(callbackQueryId);

    // === Свой вариант ===
    if (choice === 'custom') {
        state.pendingPoll.waitingForCustomInput = true;
        saveState();

        await sendMessage('✏️ Введите свой вариант:');

        if (state.pendingPoll.messageId) {
            await editMessageText(
                state.pendingPoll.messageId,
                `${state.pendingPoll.question}\n\n⏳ Ожидание вашего варианта...`
            );
        }
        return;
    }

    // === Готово (для множественного выбора) ===
    if (choice === 'done') {
        const selectedOptions = state.pendingPoll.selected.map(i => state.pendingPoll.options[i]);
        const answer = selectedOptions.join(', ');

        if (state.pendingPoll.messageId) {
            await editMessageText(
                state.pendingPoll.messageId,
                `${state.pendingPoll.question}\n\n✅ Выбрано: ${answer}`
            );
        }

        state.pendingPoll = null;
        saveState();

        await resumeClaudeWithPollAnswer(answer);
        return;
    }

    // === Выбор варианта ===
    const optionIndex = parseInt(choice);
    if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= state.pendingPoll.options.length) {
        await sendMessage('❌ Неверный вариант');
        return;
    }

    // Множественный выбор - переключаем состояние
    if (state.pendingPoll.multiple) {
        const idx = state.pendingPoll.selected.indexOf(optionIndex);
        if (idx === -1) {
            state.pendingPoll.selected.push(optionIndex);
        } else {
            state.pendingPoll.selected.splice(idx, 1);
        }
        saveState();
        await updatePollMessage();
        return;
    }

    // Одиночный выбор - завершаем
    const selectedOption = state.pendingPoll.options[optionIndex];

    if (state.pendingPoll.messageId) {
        await editMessageText(
            state.pendingPoll.messageId,
            `${state.pendingPoll.question}\n\n✅ Выбрано: ${selectedOption}`
        );
    }

    state.pendingPoll = null;
    saveState();

    await resumeClaudeWithPollAnswer(selectedOption);
}

/**
 * Возобновляет Claude с ответом на опрос
 */
async function resumeClaudeWithPollAnswer(answer) {
    console.log(`[POLL ANSWER] "${answer}"`);

    const prompt = `Мой выбор: ${answer}`;

    await sendMessage(`🔄 Отправляю ответ...\n"${answer}"`);

    try {
        await runClaudeCommand(prompt);
    } catch (error) {
        await sendMessage(`❌ Ошибка: ${error.message}`);
    }
}

/**
 * Отменяет активный опрос
 */
async function cancelPendingPoll(reason = 'Отменён') {
    if (!state.pendingPoll) return;

    console.log(`[POLL] Cancelling: ${reason}`);

    if (state.pendingPoll.messageId) {
        await editMessageText(
            state.pendingPoll.messageId,
            `${state.pendingPoll.question}\n\n⏹ ${reason}`
        );
    }

    state.pendingPoll = null;
    saveState();
}

// ============ Claude CLI ============

function getPermissionModeArg() {
    switch (state.permissionMode) {
        case 'bypassPermissions':
            return '--dangerously-skip-permissions';
        case 'plan':
            return '--permission-mode=plan';
        case 'acceptEdits':
            return '--permission-mode=acceptEdits';
        case 'dontAsk':
            return '--permission-mode=dontAsk';
        default:
            return null;
    }
}

function getPermissionModeEmoji() {
    switch (state.permissionMode) {
        case 'bypassPermissions': return '⚠️ DANGER';
        case 'plan': return '📋 Plan';
        case 'acceptEdits': return '✏️ AcceptEdits';
        case 'dontAsk': return '🤫 DontAsk';
        default: return '✅ Default';
    }
}

// Запуск Claude в режиме --print с JSON output для сохранения session_id
function runClaudeCommand(prompt, imagePaths = null) {
    return new Promise((resolve, reject) => {
        if (claudeProcess) {
            sendMessage('⏳ Claude уже обрабатывает запрос, подождите...');
            resolve();
            return;
        }

        console.log(`[CLAUDE] Запуск...`);
        console.log(`[CLAUDE] Режим: ${state.permissionMode}, Модель: ${state.model}, Session: ${state.sessionId || 'new'}`);

        const args = ['--print', '--output-format', 'json'];

        // Включаем все инструменты для режима --print (по умолчанию они отключены)
        args.push('--tools', 'default');

        // Режим разрешений
        const permArg = getPermissionModeArg();
        if (permArg) args.push(permArg);

        // Модель
        if (state.model) {
            args.push('--model', state.model);
        }

        // Продолжение сессии (сохраняем контекст)
        if (state.sessionId) {
            args.push('--resume', state.sessionId);
        }

        // Системный промпт
        if (state.systemPrompt) {
            args.push('--append-system-prompt', state.systemPrompt);
        }

        // Добавляем доступ к папкам с изображениями
        args.push('--add-dir', IMAGES_DIR);
        args.push('--add-dir', SCREENSHOTS_DIR);

        // Формируем промпт с изображениями
        // Claude CLI автоматически распознаёт пути к изображениям в промпте
        // и использует Read tool для их анализа
        const images = imagePaths ? (Array.isArray(imagePaths) ? imagePaths : [imagePaths]) : [];
        let finalPrompt = prompt;

        if (images.length > 0) {
            const validImages = images.filter(imgPath => fs.existsSync(imgPath));
            if (validImages.length > 0) {
                // Формируем промпт с явным указанием прочитать изображение
                const imageList = validImages.map(p => p).join('\n');
                finalPrompt = `Пользователь прислал изображение. Прочитай его через Read tool и проанализируй:\n${imageList}\n\nЗапрос пользователя: ${prompt}`;
                console.log(`[CLAUDE] Images to analyze: ${validImages.join(', ')}`);
            }
        }

        console.log(`[CLAUDE] Args: ${args.join(' ').substring(0, 150)}...`);

        claudeProcess = spawn('claude', args, {
            cwd: PROJECT_DIR,
            env: {
                ...process.env,
                LANG: 'en_US.UTF-8',
                TERM: 'dumb',
                NO_COLOR: '1'
            },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        claudeProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        claudeProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        claudeProcess.on('close', async (code) => {
            console.log(`[CLAUDE] Завершён (код ${code})`);
            claudeProcess = null;

            if (code === 0 && output) {
                try {
                    const json = JSON.parse(output);

                    // Сохраняем session_id для продолжения контекста
                    if (json.session_id) {
                        state.sessionId = json.session_id;
                        saveState();
                        console.log(`[CLAUDE] Session: ${state.sessionId}`);
                    }

                    // Отправляем результат
                    if (json.result) {
                        let resultText = stripAnsi(json.result).trim();

                        // 1. Проверяем на изображения для отправки
                        const imageExtract = extractTelegramImage(resultText);
                        if (imageExtract) {
                            resultText = imageExtract.cleanText;
                            for (const imgPath of imageExtract.images) {
                                try {
                                    await sendPhoto(imgPath, '📷 Изображение от Claude');
                                } catch (e) {
                                    await sendMessage(`❌ Ошибка отправки изображения: ${e.message}`);
                                }
                            }
                        }

                        // 2. Проверяем на файлы для отправки
                        const fileExtract = extractTelegramFile(resultText);
                        if (fileExtract) {
                            resultText = fileExtract.cleanText;
                            for (const filePath of fileExtract.files) {
                                try {
                                    await sendDocument(filePath, '📁 Файл от Claude');
                                } catch (e) {
                                    await sendMessage(`❌ Ошибка отправки файла: ${e.message}`);
                                }
                            }
                        }

                        // 3. Проверяем на напоминания
                        const reminderExtract = extractTelegramReminder(resultText);
                        if (reminderExtract) {
                            resultText = reminderExtract.cleanText;
                            for (const rem of reminderExtract.reminders) {
                                createReminder(rem.delay_minutes, rem.message);
                                await sendMessage(`⏰ Напоминание создано: "${rem.message}" через ${rem.delay_minutes} мин`);
                            }
                        }

                        // 4. Проверяем на запрос скриншота экрана
                        const screenshotExtract = extractTelegramScreenshot(resultText);
                        if (screenshotExtract) {
                            resultText = screenshotExtract.cleanText;
                            for (const filename of screenshotExtract.screenshots) {
                                const screenshotPath = takeScreenshot(filename);
                                if (screenshotPath) {
                                    try {
                                        await sendPhoto(screenshotPath, '📸 Скриншот экрана');
                                    } catch (e) {
                                        await sendMessage(`❌ Ошибка отправки скриншота: ${e.message}`);
                                    }
                                } else {
                                    await sendMessage('❌ Не удалось сделать скриншот (нет GUI или инструментов)');
                                }
                            }
                        }

                        // 5. Проверяем на запрос последнего изображения
                        const lastImageExtract = extractTelegramGetLastImage(resultText);
                        if (lastImageExtract) {
                            resultText = lastImageExtract.cleanText;
                            const lastImage = getLastImagePath();
                            if (lastImage) {
                                await sendMessage(`📷 Последнее изображение: ${lastImage}`);
                            } else {
                                await sendMessage('📷 Нет сохранённых изображений');
                            }
                        }

                        // 6. Проверяем на информационное изображение
                        const infoImageExtract = extractInfoImage(resultText);
                        if (infoImageExtract) {
                            resultText = infoImageExtract.cleanText;
                            for (const imageText of infoImageExtract.texts) {
                                const imagePath = createInfoImage(imageText);
                                if (imagePath) {
                                    try {
                                        await sendPhoto(imagePath, '📊 Информация от Claude');
                                    } catch (e) {
                                        await sendMessage(`❌ Ошибка отправки изображения: ${e.message}`);
                                    }
                                } else {
                                    await sendMessage(`📝 ${imageText}`);
                                }
                            }
                        }

                        // 7. Проверяем на опрос
                        const pollExtract = extractTelegramPoll(resultText);
                        if (pollExtract) {
                            if (pollExtract.cleanText) {
                                await sendMessage(pollExtract.cleanText);
                            }
                            await sendPoll(pollExtract.pollData);
                        } else if (resultText) {
                            await sendMessage(resultText);
                        }
                    } else if (json.is_error && json.error) {
                        await sendMessage(`❌ Ошибка: ${json.error}`);
                    }

                    // Обновляем информацию о контексте и стоимости
                    if (json.total_cost_usd) {
                        state.lastCost = json.total_cost_usd;
                        state.totalCost = (state.totalCost || 0) + json.total_cost_usd;
                        console.log(`[CLAUDE] Cost: $${json.total_cost_usd.toFixed(4)}`);
                    }

                    // Извлекаем использование контекста из modelUsage
                    // Контекст = inputTokens + outputTokens (без кэша, кэш не занимает место)
                    if (json.modelUsage) {
                        let totalInput = 0;
                        let totalOutput = 0;
                        let contextWindow = 200000;
                        for (const model in json.modelUsage) {
                            const usage = json.modelUsage[model];
                            // Только реальные токены, не кэшированные
                            totalInput += (usage.inputTokens || 0);
                            totalOutput += (usage.outputTokens || 0);
                            if (usage.contextWindow) contextWindow = usage.contextWindow;
                        }
                        // Накапливаем контекст (история разговора растёт)
                        state.contextUsed = (state.contextUsed || 0) + totalOutput;
                        // Но ограничиваем максимумом окна
                        if (state.contextUsed > contextWindow) {
                            state.contextUsed = contextWindow;
                        }
                        state.contextWindow = contextWindow;
                        saveState();

                        // Показываем предупреждение если контекст > 70%
                        const contextPercent = Math.round((state.contextUsed / contextWindow) * 100);
                        if (contextPercent >= 90) {
                            await sendMessage(`🔴 Контекст: ${contextPercent}% — критический уровень! Рекомендую /new`);
                        } else if (contextPercent >= 70) {
                            await sendMessage(`🟡 Контекст: ${contextPercent}%`);
                        }
                    }
                } catch (e) {
                    // Если не JSON - отправляем как есть
                    console.log(`[CLAUDE] JSON parse error: ${e.message}`);
                    const cleanOutput = stripAnsi(output).trim();
                    if (cleanOutput) {
                        await sendMessage(cleanOutput);
                    }
                }
            } else if (code !== 0) {
                await sendMessage(`❌ Ошибка Claude (код ${code}): ${stripAnsi(errorOutput).substring(0, 500)}`);
            }

            resolve();
        });

        claudeProcess.on('error', (err) => {
            console.error('[CLAUDE ERROR]', err.message);
            sendMessage(`❌ Ошибка запуска: ${err.message}`);
            claudeProcess = null;
            reject(err);
        });

        // Отправляем промпт через stdin и закрываем
        claudeProcess.stdin.write(finalPrompt);
        claudeProcess.stdin.end();
    });
}

// Для совместимости (теперь просто вызывает runClaudeCommand)
function startClaudeSession(prompt, imagePath = null) {
    return runClaudeCommand(prompt, imagePath);
}

function sendToClaudeSession(input) {
    // В режиме --print нет постоянной сессии, запускаем новый запрос
    runClaudeCommand(input);
}

function stopClaudeSession() {
    if (claudeProcess) {
        claudeProcess.kill('SIGTERM');
        claudeProcess = null;
        waitingForInput = false;
        return true;
    }
    return false;
}

function detectConfirmationPrompt(text) {
    const patterns = [
        /Do you want to/i,
        /Allow this/i,
        /Proceed\?/i,
        /Continue\?/i,
        /\[y\/n\]/i,
        /\[Y\/n\]/i,
        /\(y\/n\)/i,
        /yes\/no/i,
        /approve/i,
        /permission/i,
        /Want to run/i,
        /Execute\?/i,
        /Allow Claude/i,
        /Press Enter/i
    ];
    return patterns.some(p => p.test(text));
}

// Очистка ANSI escape-кодов
function stripAnsi(text) {
    // Удаляем все ANSI escape sequences
    return text
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')  // CSI sequences
        .replace(/\x1B\][^\x07]*\x07/g, '')      // OSC sequences
        .replace(/\x1B[()][AB012]/g, '')         // Character set
        .replace(/\x1B[PX^_][^\x1B]*\x1B\\/g, '')// String terminator sequences
        .replace(/\r/g, '')                       // Carriage returns
        .replace(/\x07/g, '')                     // Bell
        .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\t' ? c : '');  // Other control chars except newline/tab
}

/**
 * Конвертирует Markdown в HTML для Telegram
 * Поддерживает: **bold**, *italic*, `code`, ```code blocks```, [links](url), ~~strikethrough~~
 */
function markdownToTelegramHtml(text) {
    if (!text) return text;

    // Защищаем HTML-специальные символы
    let result = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Код блоки (```code```) - обрабатываем первыми
    result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Инлайн код (`code`)
    result = result.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Жирный текст (**text** или __text__)
    result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    result = result.replace(/__([^_]+)__/g, '<b>$1</b>');

    // Курсив (*text* или _text_) - но не внутри слов
    result = result.replace(/(?<![a-zA-Z0-9])\*([^*\n]+)\*(?![a-zA-Z0-9])/g, '<i>$1</i>');
    result = result.replace(/(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>');

    // Зачёркнутый (~~text~~)
    result = result.replace(/~~([^~]+)~~/g, '<s>$1</s>');

    // Ссылки [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    return result;
}

// ============ MCP Commands ============

async function listMcpServers() {
    try {
        const result = execSync('claude mcp list', { cwd: PROJECT_DIR, encoding: 'utf8' });
        return result || 'Нет настроенных MCP серверов';
    } catch (e) {
        return `Ошибка: ${e.message}`;
    }
}

async function getMcpServer(name) {
    try {
        const result = execSync(`claude mcp get ${name}`, { cwd: PROJECT_DIR, encoding: 'utf8' });
        return result || 'Сервер не найден';
    } catch (e) {
        return `Ошибка: ${e.message}`;
    }
}

async function addMcpServer(name, packageName) {
    try {
        // Используем claude mcp add для установки
        const cmd = `claude mcp add ${name} ${packageName}`;
        console.log(`[MCP] Adding server: ${cmd}`);
        const result = execSync(cmd, {
            cwd: PROJECT_DIR,
            encoding: 'utf8',
            timeout: 120000,  // 2 минуты на установку
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Перезапускаем сессию чтобы подхватить новый MCP
        stopClaudeSession();
        state.sessionId = null;
        saveState();

        return `✅ MCP сервер "${name}" установлен!\n\n${result}\n\nСессия перезапущена для применения изменений.`;
    } catch (e) {
        return `❌ Ошибка установки MCP:\n${e.message}\n\n${e.stderr || ''}`;
    }
}

async function removeMcpServer(name) {
    try {
        const cmd = `claude mcp remove ${name}`;
        console.log(`[MCP] Removing server: ${cmd}`);
        const result = execSync(cmd, {
            cwd: PROJECT_DIR,
            encoding: 'utf8',
            timeout: 30000
        });

        // Перезапускаем сессию
        stopClaudeSession();
        state.sessionId = null;
        saveState();

        return `✅ MCP сервер "${name}" удалён!\n\n${result}\n\nСессия перезапущена.`;
    } catch (e) {
        return `❌ Ошибка удаления MCP:\n${e.message}`;
    }
}

// ============ Command Handlers ============

async function handleCommand(text) {
    const cmd = text.toLowerCase().trim();
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    // === РЕЖИМЫ РАЗРЕШЕНИЙ ===
    if (cmd === '/danger' || cmd === '/bypass') {
        state.permissionMode = 'bypassPermissions';
        saveState();
        stopClaudeSession();
        await sendMessage(`⚠️ DANGER MODE

Claude выполняет ВСЕ без подтверждений!
Будь осторожен.

/safe - вернуться в безопасный режим`);
        return true;
    }

    if (cmd === '/safe' || cmd === '/default') {
        state.permissionMode = 'default';
        saveState();
        stopClaudeSession();
        await sendMessage(`✅ Безопасный режим

Claude запрашивает подтверждения.`);
        return true;
    }

    if (cmd === '/plan') {
        state.permissionMode = 'plan';
        saveState();
        stopClaudeSession();
        await sendMessage(`📋 Plan Mode

Claude только планирует, не выполняет.
Сначала покажет план, потом спросит подтверждение.`);
        return true;
    }

    if (cmd === '/acceptedits') {
        state.permissionMode = 'acceptEdits';
        saveState();
        stopClaudeSession();
        await sendMessage(`✏️ Accept Edits Mode

Claude автоматически применяет изменения в файлах,
но спрашивает подтверждение для команд.`);
        return true;
    }

    if (cmd === '/dontask') {
        state.permissionMode = 'dontAsk';
        saveState();
        stopClaudeSession();
        await sendMessage(`🤫 Don't Ask Mode

Claude не спрашивает, но и не выполняет опасные действия.`);
        return true;
    }

    // === МОДЕЛИ ===
    if (cmd === '/sonnet') {
        state.model = 'sonnet';
        saveState();
        stopClaudeSession();
        await sendMessage(`🧠 Модель: Claude Sonnet 4 (быстрая и умная)`);
        return true;
    }

    if (cmd === '/opus' || cmd === '/opus4.5') {
        state.model = 'claude-opus-4-5-20251101';
        saveState();
        stopClaudeSession();
        await sendMessage(`🧠 Модель: Claude Opus 4.5 (самая умная)`);
        return true;
    }

    if (cmd === '/haiku') {
        state.model = 'haiku';
        saveState();
        stopClaudeSession();
        await sendMessage(`🧠 Модель: Claude Haiku (самая быстрая)`);
        return true;
    }

    // === СЕССИИ ===
    if (cmd === '/stop' || cmd === '/kill') {
        if (stopClaudeSession()) {
            await sendMessage('⏹ Сессия остановлена');
        } else {
            await sendMessage('Нет активной сессии');
        }
        return true;
    }

    if (cmd === '/new' || cmd === '/newsession' || cmd === '/reset') {
        stopClaudeSession();
        state.sessionId = null;
        state.contextUsed = 0;
        state.totalCost = 0;
        state.lastCost = 0;
        saveState();
        await sendMessage('🆕 Новая сессия. Контекст и счётчики сброшены.');
        return true;
    }

    if (cmd === '/continue' || cmd === '/c') {
        // В режиме --print используем --continue для следующего запроса
        state.sessionId = null; // Claude сам определит последнюю сессию через --continue
        saveState();
        await sendMessage('▶️ Следующий запрос продолжит последнюю сессию (--continue)');
        return true;
    }

    // === MCP ===
    if (cmd === '/mcp' || cmd === '/mcplist') {
        const list = await listMcpServers();
        await sendMessage(`📡 MCP Серверы:\n\n${list}`);
        return true;
    }

    if (command === '/mcpget' && parts[1]) {
        const info = await getMcpServer(parts[1]);
        await sendMessage(`📡 MCP "${parts[1]}":\n\n${info}`);
        return true;
    }

    // /mcpadd <name> <package> - установить MCP сервер
    if (command === '/mcpadd') {
        if (parts.length < 3) {
            await sendMessage(`➕ Установка MCP сервера

Формат: /mcpadd <имя> <пакет>

Примеры:
/mcpadd fetch @anthropic/fetch-mcp
/mcpadd postgres @anthropic/postgres-mcp
/mcpadd github @anthropic/github-mcp
/mcpadd filesystem @anthropic/filesystem-mcp
/mcpadd memory @anthropic/memory-mcp
/mcpadd puppeteer @anthropic/puppeteer-mcp
/mcpadd slack @anthropic/slack-mcp
/mcpadd google-drive @anthropic/google-drive-mcp

Или свой пакет:
/mcpadd myserver npm-package-name`);
            return true;
        }
        const serverName = parts[1];
        const packageName = parts.slice(2).join(' ');
        const result = await addMcpServer(serverName, packageName);
        await sendMessage(result);
        return true;
    }

    // /mcpremove <name> - удалить MCP сервер
    if (command === '/mcpremove' || command === '/mcpdel') {
        if (!parts[1]) {
            const list = await listMcpServers();
            await sendMessage(`➖ Удаление MCP сервера

Формат: /mcpremove <имя>

${list}`);
            return true;
        }
        const serverName = parts[1];
        const result = await removeMcpServer(serverName);
        await sendMessage(result);
        return true;
    }

    // /context - показать использование контекста
    if (cmd === '/context' || cmd === '/ctx') {
        const used = state.contextUsed || 0;
        const window = state.contextWindow || 200000;
        const percent = Math.round((used / window) * 100);
        const remaining = window - used;

        let statusEmoji = '🟢';
        let statusText = 'Отлично';
        if (percent >= 90) {
            statusEmoji = '🔴';
            statusText = 'Критический! Рекомендую /new';
        } else if (percent >= 70) {
            statusEmoji = '🟡';
            statusText = 'Высокий';
        } else if (percent >= 50) {
            statusEmoji = '🟢';
            statusText = 'Нормальный';
        }

        await sendMessage(`${statusEmoji} Контекст: ${percent}%

📊 Использовано: ${used.toLocaleString()} токенов
📦 Всего доступно: ${window.toLocaleString()} токенов
💾 Осталось: ${remaining.toLocaleString()} токенов

💰 Последний запрос: $${(state.lastCost || 0).toFixed(4)}
💵 Всего за сессию: $${(state.totalCost || 0).toFixed(4)}

Статус: ${statusText}`);
        return true;
    }

    // /cost - показать стоимость сессии
    if (cmd === '/cost') {
        const logFile = path.join(BRIDGE_DIR, 'bot.log');
        try {
            const log = fs.readFileSync(logFile, 'utf8');
            const costs = log.match(/Cost: \$[\d.]+/g) || [];
            if (costs.length > 0) {
                const lastCosts = costs.slice(-10);
                let total = 0;
                costs.forEach(c => {
                    const val = parseFloat(c.replace('Cost: $', ''));
                    if (!isNaN(val)) total += val;
                });
                await sendMessage(`💰 Стоимость сессии

Последние операции:
${lastCosts.join('\n')}

Всего за сессию: $${total.toFixed(4)}`);
            } else {
                await sendMessage('💰 Пока нет данных о стоимости');
            }
        } catch (e) {
            await sendMessage('💰 Не удалось получить данные о стоимости');
        }
        return true;
    }

    // === СИСТЕМНЫЙ ПРОМПТ ===
    if (command === '/systemprompt' || command === '/sp') {
        const prompt = parts.slice(1).join(' ');
        if (prompt) {
            state.systemPrompt = prompt;
            saveState();
            stopClaudeSession();
            await sendMessage(`📝 Системный промпт установлен:\n${prompt}`);
        } else {
            state.systemPrompt = null;
            saveState();
            await sendMessage('📝 Системный промпт очищен');
        }
        return true;
    }

    // === ПОДТВЕРЖДЕНИЯ ===
    if (waitingForInput) {
        if (cmd === '1' || cmd === 'да' || cmd === 'yes' || cmd === 'y' || cmd.startsWith('1 -')) {
            sendToClaudeSession('y');
            return true;
        }
        if (cmd === '2' || cmd === 'нет' || cmd === 'no' || cmd === 'n' || cmd.startsWith('2 -')) {
            sendToClaudeSession('n');
            return true;
        }
        if (cmd === '3' || cmd.includes('всегда') || cmd.startsWith('3 -')) {
            sendToClaudeSession('a');
            return true;
        }
    }

    // === ИНФО ===
    if (cmd === '/status' || cmd === '/info') {
        const modelShort = state.model.includes('opus') ? 'Opus 4.5' :
                          state.model.includes('sonnet') ? 'Sonnet 4' :
                          state.model.includes('haiku') ? 'Haiku' : state.model;
        await sendMessage(`📊 Статус Claude Code Bridge

🔐 Режим: ${getPermissionModeEmoji()}
🧠 Модель: ${modelShort}
📍 Сессия: ${state.sessionId ? state.sessionId.substring(0, 8) + '...' : '🆕 Новая'}
🔄 Claude: ${claudeProcess ? '🟢 Работает' : '⚪ Готов'}
📝 Sys prompt: ${state.systemPrompt ? '✅' : '❌'}

📁 ${PROJECT_DIR}

💡 Контекст сохраняется между сообщениями!
/new - начать новую сессию`);
        return true;
    }

    if (cmd === '/help' || cmd === '/start') {
        await sendMessage(`🤖 Alko Technics Claude Code Bridge

Проект: alko_technics

═══ РЕЖИМЫ ═══
/safe - безопасный (подтверждения) ✅
/danger - без подтверждений ⚠️
/plan - режим планирования 📋
/acceptedits - авто-применение правок ✏️

═══ МОДЕЛИ ═══
/sonnet - Claude Sonnet 4 (баланс)
/opus - Claude Opus 4.5 (умный)
/haiku - Claude Haiku (быстрый)

═══ СЕССИИ ═══
/new - новая сессия
/continue - продолжить последнюю
/stop - остановить
/context - использование контекста

═══ ФАЙЛЫ ═══
/images - список изображений
/sendimage N - отправить #N
/lastimage - последнее изображение

═══ MCP ═══
/mcp - список серверов
/mcpadd <name> <pkg> - установить MCP

═══ ПРОЧЕЕ ═══
/sp <текст> - системный промпт
/status - статус
/version - версия Claude

═══ ПОДТВЕРЖДЕНИЯ ═══
1 - Да, 2 - Нет, 3 - Всегда да

📷 Отправь фото или файл — Claude проанализирует
💬 Просто пиши сообщения — Claude выполнит

${getPermissionModeEmoji()} | ${state.model}`);
        return true;
    }

    if (cmd === '/version' || cmd === '/v') {
        try {
            const version = execSync('claude --version', { encoding: 'utf8' }).trim();
            await sendMessage(`📦 ${version}`);
        } catch (e) {
            await sendMessage('Ошибка получения версии');
        }
        return true;
    }

    // === ИЗОБРАЖЕНИЯ ===
    if (cmd === '/lastimage' || cmd === '/li') {
        const lastImage = getLastImagePath();
        if (lastImage) {
            await sendMessage(`📷 Последнее изображение:\n${lastImage}`);
            try {
                await sendPhoto(lastImage, 'Последнее полученное изображение');
            } catch (e) {
                await sendMessage(`❌ Ошибка отправки: ${e.message}`);
            }
        } else {
            await sendMessage('📷 Нет сохранённых изображений');
        }
        return true;
    }

    if (cmd === '/images' || cmd === '/listimages') {
        try {
            const files = fs.readdirSync(IMAGES_DIR)
                .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
                .sort((a, b) => {
                    const statA = fs.statSync(path.join(IMAGES_DIR, a));
                    const statB = fs.statSync(path.join(IMAGES_DIR, b));
                    return statB.mtime - statA.mtime;
                })
                .slice(0, 10);

            if (files.length > 0) {
                await sendMessage(`📷 Последние изображения (${files.length}):\n\n${files.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n/sendimage <номер> - отправить`);
            } else {
                await sendMessage('📷 Нет сохранённых изображений');
            }
        } catch (e) {
            await sendMessage(`❌ Ошибка: ${e.message}`);
        }
        return true;
    }

    if (command === '/sendimage' || command === '/si') {
        const idx = parseInt(parts[1]) - 1;
        if (isNaN(idx) || idx < 0) {
            await sendMessage('❌ Укажи номер изображения: /sendimage 1');
            return true;
        }

        try {
            const files = fs.readdirSync(IMAGES_DIR)
                .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
                .sort((a, b) => {
                    const statA = fs.statSync(path.join(IMAGES_DIR, a));
                    const statB = fs.statSync(path.join(IMAGES_DIR, b));
                    return statB.mtime - statA.mtime;
                });

            if (idx < files.length) {
                const imgPath = path.join(IMAGES_DIR, files[idx]);
                await sendPhoto(imgPath, files[idx]);
            } else {
                await sendMessage(`❌ Изображение #${idx + 1} не найдено`);
            }
        } catch (e) {
            await sendMessage(`❌ Ошибка: ${e.message}`);
        }
        return true;
    }

    if (cmd === '/screenshots' || cmd === '/listscreenshots') {
        try {
            const files = fs.readdirSync(SCREENSHOTS_DIR)
                .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
                .sort((a, b) => {
                    const statA = fs.statSync(path.join(SCREENSHOTS_DIR, a));
                    const statB = fs.statSync(path.join(SCREENSHOTS_DIR, b));
                    return statB.mtime - statA.mtime;
                })
                .slice(0, 10);

            if (files.length > 0) {
                await sendMessage(`📸 Скриншоты (${files.length}):\n\n${files.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n/sendscreenshot <номер> - отправить`);
            } else {
                await sendMessage('📸 Нет скриншотов');
            }
        } catch (e) {
            await sendMessage(`❌ Ошибка: ${e.message}`);
        }
        return true;
    }

    if (command === '/sendscreenshot' || command === '/ss') {
        const idx = parseInt(parts[1]) - 1;
        if (isNaN(idx) || idx < 0) {
            await sendMessage('❌ Укажи номер скриншота: /sendscreenshot 1');
            return true;
        }

        try {
            const files = fs.readdirSync(SCREENSHOTS_DIR)
                .filter(f => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
                .sort((a, b) => {
                    const statA = fs.statSync(path.join(SCREENSHOTS_DIR, a));
                    const statB = fs.statSync(path.join(SCREENSHOTS_DIR, b));
                    return statB.mtime - statA.mtime;
                });

            if (idx < files.length) {
                const imgPath = path.join(SCREENSHOTS_DIR, files[idx]);
                await sendPhoto(imgPath, files[idx]);
            } else {
                await sendMessage(`❌ Скриншот #${idx + 1} не найден`);
            }
        } catch (e) {
            await sendMessage(`❌ Ошибка: ${e.message}`);
        }
        return true;
    }

    return false;
}

// ============ Message Handler ============

async function handleMessage(msg) {
    const text = msg.text || '';
    console.log(`[MSG] ${text}`);

    // Проверяем ожидание custom input для опроса
    if (state.pendingPoll?.waitingForCustomInput) {
        const customAnswer = text;
        const messageId = state.pendingPoll.messageId;
        const question = state.pendingPoll.question;

        // Обновляем сообщение с опросом
        if (messageId) {
            await editMessageText(
                messageId,
                `${question}\n\n✅ Ваш вариант: ${customAnswer}`
            );
        }

        // Очищаем состояние опроса
        state.pendingPoll = null;
        saveState();

        // Отправляем ответ в Claude
        await resumeClaudeWithPollAnswer(customAnswer);
        return;
    }

    // Если активен опрос, отменяем его при новом сообщении
    if (state.pendingPoll && !text.startsWith('/')) {
        await cancelPendingPoll('Отменён новым сообщением');
    }

    if (await handleCommand(text)) return;

    // Показываем что работаем
    const modelShort = state.model.includes('opus') ? 'Opus 4.5' : state.model;
    await sendMessage(`🚀 Обрабатываю... (${modelShort})`);

    try {
        await runClaudeCommand(text);
    } catch (error) {
        await sendMessage(`Ошибка: ${error.message}`);
    }
}

async function handlePhoto(msg) {
    const photo = msg.photo[msg.photo.length - 1];
    const caption = msg.caption || 'Проанализируй этот скриншот';

    try {
        const filePath = await getFilePath(photo.file_id);
        const localPath = path.join(IMAGES_DIR, `photo_${Date.now()}${path.extname(filePath) || '.jpg'}`);
        await downloadFile(filePath, localPath);

        // Сохраняем путь к последнему изображению для доступа Claude
        saveLastImagePath(localPath);

        const modelShort = state.model.includes('opus') ? 'Opus 4.5' :
                          state.model.includes('sonnet') ? 'Sonnet' :
                          state.model.includes('haiku') ? 'Haiku' : state.model;
        await sendMessage(`📸 Анализирую изображение... (${modelShort})`);
        await runClaudeCommand(caption, localPath);
    } catch (error) {
        await sendMessage(`Ошибка: ${error.message}`);
    }
}

async function handleVoice(msg) {
    // Голосовые сообщения пока не поддерживаются в этом проекте
    await sendMessage(`🎙️ Голосовые сообщения пока не поддерживаются.\n\nПожалуйста, отправьте текстовое сообщение.`);
}

async function handleDocument(msg) {
    const doc = msg.document;
    const caption = msg.caption || `Проанализируй этот файл: ${doc.file_name}`;

    try {
        const filePath = await getFilePath(doc.file_id);
        const ext = path.extname(doc.file_name) || '';
        const localPath = path.join(IMAGES_DIR, `doc_${Date.now()}_${doc.file_name}`);
        await downloadFile(filePath, localPath);

        // Определяем тип файла
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        const pdfExts = ['.pdf'];
        const isImage = imageExts.includes(ext.toLowerCase());
        const isPdf = pdfExts.includes(ext.toLowerCase());

        if (isImage || isPdf) {
            // Сохраняем путь к последнему изображению/pdf для доступа Claude
            saveLastImagePath(localPath);

            const typeEmoji = isPdf ? '📄' : '📸';
            const typeName = isPdf ? 'PDF' : 'Изображение';
            await sendMessage(`${typeEmoji} ${typeName} сохранено: ${localPath}\nАнализирую...`);
            // Claude Code поддерживает --image для изображений и PDF
            await runClaudeCommand(caption, localPath);
        } else {
            // Для не-изображений читаем содержимое если это текст
            const textExts = ['.txt', '.md', '.json', '.js', '.py', '.ts', '.css', '.html', '.xml', '.yaml', '.yml', '.sh', '.log', '.csv', '.env', '.gitignore', '.sql', '.go', '.rs', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp'];
            if (textExts.includes(ext.toLowerCase())) {
                const content = fs.readFileSync(localPath, 'utf8');
                const truncated = content.length > 10000 ? content.substring(0, 10000) + '\n...(truncated)' : content;
                await sendMessage(`📁 Анализирую файл ${doc.file_name}...`);
                await runClaudeCommand(`${caption}\n\nСодержимое файла ${doc.file_name}:\n\`\`\`\n${truncated}\n\`\`\``);
            } else {
                await sendMessage(`📁 Файл ${doc.file_name} сохранён: ${localPath}`);
                await runClaudeCommand(`${caption}\n\nФайл сохранён: ${localPath}`);
            }
        }
    } catch (error) {
        await sendMessage(`Ошибка: ${error.message}`);
    }
}

// ============ Bot Commands Menu ============

async function setMyCommands() {
    const commands = [
        { command: 'status', description: 'Статус бота и сессии' },
        { command: 'help', description: 'Справка по командам' },
        { command: 'danger', description: '⚠️ Режим без подтверждений' },
        { command: 'safe', description: '✅ Безопасный режим' },
        { command: 'new', description: 'Новая сессия Claude' },
        { command: 'stop', description: 'Остановить Claude' },
        { command: 'opus', description: '🧠 Модель Opus 4.5' },
        { command: 'sonnet', description: '🧠 Модель Sonnet 4' },
        { command: 'haiku', description: '🧠 Модель Haiku' },
        { command: 'mcp', description: '📡 Список MCP серверов' },
        { command: 'mcpadd', description: '➕ Установить MCP сервер' },
        { command: 'mcpremove', description: '➖ Удалить MCP сервер' },
        { command: 'screenshot', description: '📸 Скриншот браузера' },
        { command: 'files', description: '📁 Список файлов' },
        { command: 'context', description: '📊 Контекст и токены' },
        { command: 'cost', description: '💰 Стоимость сессии' }
    ];

    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ commands });
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/setMyCommands`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.ok) {
                        console.log('[BOT] Menu commands registered successfully');
                    } else {
                        console.error('[BOT] Failed to set commands:', result.description);
                    }
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ============ Main ============

async function startBot() {
    // Получаем информацию о боте
    try {
        const info = await getBotInfo();
        console.log(`[BOT] Connected as @${info.username} (${info.first_name})`);
    } catch (e) {
        console.error('[BOT] Failed to get bot info:', e.message);
    }

    console.log('');
    console.log('═'.repeat(55));
    console.log('  Claude Code Bridge - Full Control');
    console.log('═'.repeat(55));
    console.log(`  Mode: ${state.permissionMode} | Model: ${state.model}`);
    console.log(`  Session: ${state.sessionId || 'None'}`);
    console.log(`  Allowed chats: ${ALLOWED_CHAT_IDS.join(', ')}`);
    if (botInfo?.username) console.log(`  Bot username: @${botInfo.username}`);
    console.log('═'.repeat(55));

    // Регистрация команд в меню Telegram
    await setMyCommands();

    // Не отправляем приветствие при каждом перезапуске - только логируем
    // Пользователь может использовать /status для проверки
    console.log('[BOT] Ready to receive messages');

    let offset = 0;

    async function poll() {
        try {
            const response = await getUpdates(offset);
            if (response.ok && response.result.length > 0) {
                for (const update of response.result) {
                    offset = update.update_id + 1;

                    // Обработка callback_query (нажатие на Inline кнопку)
                    if (update.callback_query) {
                        const cbChatId = update.callback_query.message?.chat?.id;
                        if (cbChatId && isAllowedChat(cbChatId)) {
                            setCurrentChat(cbChatId);
                            await handleCallbackQuery(update.callback_query);
                        }
                        continue;
                    }

                    // Обработка обычных сообщений
                    const msg = update.message;
                    if (msg && isAllowedChat(msg.chat.id)) {
                        // Устанавливаем текущий chat для ответов
                        setCurrentChat(msg.chat.id);

                        // В группах проверяем упоминание бота или reply
                        const isGroupChat = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
                        let shouldProcess = true;

                        if (isGroupChat && msg.text) {
                            // В группе реагируем если:
                            // 1. Упомянули бота @username
                            // 2. Ответили на сообщение бота (reply)
                            // 3. Начали с команды /
                            const botUsername = BOT_USERNAME || botInfo?.username;
                            const isMention = botUsername && msg.text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
                            const isReply = msg.reply_to_message?.from?.id === botInfo?.id;
                            const isCommand = msg.text.startsWith('/');

                            shouldProcess = isMention || isReply || isCommand;

                            // Убираем @username из текста для обработки
                            if (isMention && botUsername) {
                                msg.text = msg.text.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
                            }
                        }

                        if (shouldProcess) {
                            const senderName = msg.from?.first_name || msg.from?.username || 'Unknown';
                            const msgTypes = [];
                            if (msg.text) msgTypes.push('text');
                            if (msg.photo) msgTypes.push('photo');
                            if (msg.voice) msgTypes.push('voice');
                            if (msg.audio) msgTypes.push('audio');
                            if (msg.document) msgTypes.push('document');
                            if (msg.video) msgTypes.push('video');
                            if (msg.video_note) msgTypes.push('video_note');
                            console.log(`[MSG] From ${senderName} in ${msg.chat.type} (${msg.chat.id}) types: [${msgTypes.join(', ')}]`);

                            if (msg.photo) {
                                await handlePhoto(msg);
                            } else if (msg.voice) {
                                console.log(`[VOICE] Received voice message, duration: ${msg.voice.duration}s`);
                                await handleVoice(msg);
                            } else if (msg.audio) {
                                console.log(`[AUDIO] Received audio message`);
                                await handleVoice(msg);  // Обрабатываем audio так же как voice
                            } else if (msg.document) {
                                await handleDocument(msg);
                            } else if (msg.text) {
                                await handleMessage(msg);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Poll error:', error.message);
            await new Promise(r => setTimeout(r, 5000));
        }
        setImmediate(poll);
    }

    // Таймаут очистки опросов (10 минут)
    setInterval(async () => {
        if (state.pendingPoll && Date.now() - state.pendingPoll.timestamp > 600000) {
            console.log('[POLL] Timeout - cleaning up');
            await cancelPendingPoll('Истекло время ожидания (10 мин)');
        }
    }, 60000);

    // Проверка напоминаний каждые 30 секунд
    setInterval(async () => {
        await checkReminders();
    }, 30000);

    poll();
}

startBot();
