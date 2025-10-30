const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// WhatsApp Client
let sock = null;
let qrCode = null;
let isConnected = false;
let connectionStatus = 'disconnected';

// Initialize WhatsApp
async function initWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('QR Received');
            qrCode = await qrcode.toDataURL(qr);
            connectionStatus = 'scan_qr';
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            
            if (shouldReconnect) {
                connectionStatus = 'reconnecting';
                initWhatsApp();
            } else {
                connectionStatus = 'disconnected';
                isConnected = false;
                qrCode = null;
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Connected!');
            connectionStatus = 'connected';
            isConnected = true;
            qrCode = null;
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// API Routes
app.get('/api/status', (req, res) => {
    res.json({ 
        status: connectionStatus,
        qr: qrCode 
    });
});

app.get('/api/connect', async (req, res) => {
    if (!isConnected && qrCode) {
        res.json({ qr: qrCode, status: 'scan_qr' });
    } else if (isConnected) {
        res.json({ status: 'connected' });
    } else {
        if (sock) {
            sock.end(new Error('Restarting'));
        }
        initWhatsApp();
        res.json({ status: 'generating_qr' });
    }
});

app.get('/api/groups', async (req, res) => {
    if (!isConnected || !sock) {
        return res.json({ groups: [] });
    }

    try {
        const groups = [];
        const chats = sock.chats.all();
        
        for (const chat of chats) {
            if (chat.id.endsWith('@g.us')) { // Group chat
                const groupInfo = await sock.groupMetadata(chat.id);
                groups.push({
                    id: groupInfo.id,
                    name: groupInfo.subject,
                    participantsCount: groupInfo.participants.length
                });
            }
        }
        
        res.json({ groups });
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.json({ groups: [], error: error.message });
    }
});

app.post('/api/pushkontak', async (req, res) => {
    const { groupId, message } = req.body;

    if (!isConnected || !sock) {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }

    if (!groupId || !message) {
        return res.status(400).json({ error: 'Group ID and message required' });
    }

    try {
        const groupInfo = await sock.groupMetadata(groupId);
        const participants = groupInfo.participants;
        
        // 🛡️ SAFETY LIMIT: Max 50 pesan/hari
        const DAILY_LIMIT = 50;
        if (participants.length > DAILY_LIMIT) {
            return res.status(400).json({ 
                error: `❌ Terlalu banyak peserta! Maximum ${DAILY_LIMIT} pesan per hari untuk keamanan.` 
            });
        }
        
        let successCount = 0;
        let failCount = 0;

        console.log(`🚀 Starting push kontak to ${participants.length} participants`);
        console.log(`⏰ Delay setting: 20-60 seconds between messages`);

        // KIRIM PESAN SATU PER SATU DENGAN DELAY AMAN
        for (let i = 0; i < participants.length; i++) {
            const participant = participants[i];
            
            try {
                // Kirim pesan ke participant
                await sock.sendMessage(participant.id, { text: message });
                successCount++;
                
                console.log(`✅ Pesan ${i+1}/${participants.length} terkirim ke ${participant.id}`);
                
                // ⚡ DELAY SUPER AMAN: 20-60 DETIK ⚡
                const delaySeconds = 20 + Math.random() * 40;
                console.log(`⏳ Menunggu ${delaySeconds.toFixed(1)} detik...`);
                
                // Tampilkan progress
                const progress = ((i + 1) / participants.length * 100).toFixed(1);
                console.log(`📊 Progress: ${progress}% (${i + 1}/${participants.length})`);
                
                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
                
            } catch (error) {
                console.error(`❌ Gagal kirim ke ${participant.id}:`, error.message);
                failCount++;
                
                console.log(`⏳ Delay 10 detik karena error...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        // 🎉 Selesai
        const totalTime = (participants.length * 40).toFixed(0);
        console.log(`🎉 Push kontak selesai! ${successCount} berhasil, ${failCount} gagal`);
        
        res.json({ 
            success: true, 
            message: `✅ Push kontak selesai! 
Berhasil: ${successCount} pesan 
Gagal: ${failCount} pesan
Estimasi waktu: ~${totalTime} menit
Delay: 20-60 detik/pesan` 
        });
        
    } catch (error) {
        console.error('❌ Push kontak error:', error);
        res.status(500).json({ 
            error: 'Terjadi error: ' + error.message,
            tips: 'Pastikan WhatsApp terkoneksi dan grup valid' 
        });
    }
});

app.post('/api/save-contacts', async (req, res) => {
    const { groupId } = req.body;

    if (!isConnected || !sock) {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }

    try {
        const groupInfo = await sock.groupMetadata(groupId);
        const participants = groupInfo.participants;

        const contacts = participants.map(p => ({
            number: p.id.split('@')[0],
            name: p.name || p.notify || 'Unknown',
            group: groupInfo.subject,
            savedAt: new Date()
        }));

        res.json({ 
            success: true, 
            saved: contacts.length,
            contacts: contacts 
        });
        
    } catch (error) {
        console.error('Save contacts error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        whatsapp: isConnected ? 'connected' : 'disconnected'
    });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WhatsApp Bot Server (Baileys) running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
    
    // Initialize WhatsApp
    initWhatsApp();
});

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
