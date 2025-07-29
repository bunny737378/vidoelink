
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');

// Bot configuration
const BOT_TOKEN = '8392438827:AAGXG_6u2Tsgkm4cpRUV8ZsrCgvlKWOBITU';
const GITHUB_TOKEN = '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';
const GITHUB_OWNER = 'bunny737378';
const GITHUB_REPO = 'Link-to-file-bot';

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Store user states
const userStates = new Map();

// Helper function to get file extension
function getFileExtension(filename) {
    return filename.split('.').pop() || '';
}

// Helper function to upload file to GitHub
async function uploadToGitHub(fileBuffer, fileName, originalExtension) {
    try {
        const finalFileName = originalExtension ? `${fileName}.${originalExtension}` : fileName;
        const base64Content = fileBuffer.toString('base64');
        
        const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/public/${finalFileName}`;
        
        const data = {
            message: `Add ${finalFileName}`,
            content: base64Content,
            branch: 'main'
        };

        const response = await axios.put(url, data, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Telegram-Bot'
            }
        });

        return {
            success: true,
            downloadUrl: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/public/${finalFileName}`,
            fileName: finalFileName
        };
    } catch (error) {
        console.error('GitHub upload error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

// Handle webhook updates
async function handleUpdate(update) {
    try {
        const message = update.message;
        if (!message) return;

        const chatId = message.chat.id;
        const userId = message.from.id;

        // Handle text messages
        if (message.text) {
            const userState = userStates.get(userId);
            
            if (userState && userState.waitingForFileName) {
                // User is providing file name
                const customName = message.text.trim();
                const originalExtension = userState.originalExtension;
                
                await bot.sendMessage(chatId, '📤 Uploading file to GitHub...');
                
                const result = await uploadToGitHub(userState.fileBuffer, customName, originalExtension);
                
                if (result.success) {
                    const responseMessage = `✅ File uploaded successfully!\n\n` +
                        `📁 File Name: ${result.fileName}\n` +
                        `🔗 Streaming Link: ${result.downloadUrl}\n\n` +
                        `You can now access your file using the above link.`;
                    
                    await bot.sendMessage(chatId, responseMessage);
                } else {
                    await bot.sendMessage(chatId, `❌ Upload failed: ${result.error}`);
                }
                
                // Clear user state
                userStates.delete(userId);
                return;
            }
            
            // Regular text message
            if (message.text === '/start') {
                await bot.sendMessage(chatId, 
                    '🤖 Welcome to File Upload Bot!\n\n' +
                    'Send me any file (photo, video, document, etc.) and I will:\n' +
                    '1. Upload it to GitHub\n' +
                    '2. Ask for a custom file name\n' +
                    '3. Provide you with a streaming link\n\n' +
                    'Just send a file to get started!'
                );
            } else {
                await bot.sendMessage(chatId, 
                    'Please send a file (photo, video, document, etc.) to upload.'
                );
            }
            return;
        }

        // Handle file messages
        let fileId = null;
        let fileName = null;
        let originalExtension = '';

        if (message.document) {
            fileId = message.document.file_id;
            fileName = message.document.file_name || 'document';
            originalExtension = getFileExtension(fileName);
        } else if (message.photo) {
            const photo = message.photo[message.photo.length - 1];
            fileId = photo.file_id;
            fileName = 'photo.jpg';
            originalExtension = 'jpg';
        } else if (message.video) {
            fileId = message.video.file_id;
            fileName = message.video.file_name || 'video.mp4';
            originalExtension = getFileExtension(fileName) || 'mp4';
        } else if (message.audio) {
            fileId = message.audio.file_id;
            fileName = message.audio.file_name || 'audio.mp3';
            originalExtension = getFileExtension(fileName) || 'mp3';
        } else if (message.voice) {
            fileId = message.voice.file_id;
            fileName = 'voice.ogg';
            originalExtension = 'ogg';
        } else if (message.video_note) {
            fileId = message.video_note.file_id;
            fileName = 'video_note.mp4';
            originalExtension = 'mp4';
        } else if (message.sticker) {
            fileId = message.sticker.file_id;
            fileName = 'sticker.webp';
            originalExtension = 'webp';
        }

        if (fileId) {
            try {
                await bot.sendMessage(chatId, '📥 Downloading file...');
                
                // Get file info from Telegram
                const fileInfo = await bot.getFile(fileId);
                const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
                
                // Download file
                const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
                const fileBuffer = Buffer.from(response.data);
                
                // Store file data and wait for custom name
                userStates.set(userId, {
                    fileBuffer: fileBuffer,
                    originalExtension: originalExtension,
                    waitingForFileName: true
                });
                
                await bot.sendMessage(chatId, 
                    `📝 File received! Original name: ${fileName}\n\n` +
                    `Please send me the custom name you want for this file.\n` +
                    `(Extension .${originalExtension} will be added automatically)`
                );
                
            } catch (error) {
                console.error('File processing error:', error);
                await bot.sendMessage(chatId, '❌ Error processing file. Please try again.');
                userStates.delete(userId);
            }
        }

    } catch (error) {
        console.error('Handle update error:', error);
    }
}

// Vercel serverless function handler
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        try {
            await handleUpdate(req.body);
            res.status(200).json({ ok: true });
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        res.status(200).json({ message: 'Telegram File Upload Bot is running!' });
    }
};
