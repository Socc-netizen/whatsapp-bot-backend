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

  console.log('🔌 Connection update:', connection);
  
  if (qr) {
    console.log('📱 QR Received - please scan within 20 seconds');
    try {
      qrCode = await qrcode.toDataURL(qr);
      connectionStatus = 'scan_qr';
      console.log('✅ QR Code generated');
    } catch (error) {
      console.log('❌ QR generation failed:', error);
    }
  }

  if (connection === 'close') {
    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
    console.log('🔌 Connection closed, reconnecting:', shouldReconnect);

    if (shouldReconnect) {
      connectionStatus = 'reconnecting';
      console.log('🔄 Attempting reconnect in 3 seconds...');
      setTimeout(() => {
        console.log('🚀 Starting reconnect...');
        initWhatsApp();
      }, 3000);
    } else {
      connectionStatus = 'disconnected';
      isConnected = false;
      qrCode = null;
      console.log('❌ Logged out, please scan QR again');
    }
  } else if (connection === 'open') {
    console.log('✅ ✅ ✅ WhatsApp CONNECTED SUCCESSFULLY!');
    console.log('🤖 Bot user:', sock.user?.id || 'Unknown');
    console.log('📱 Platform:', sock.user?.platform || 'Unknown');
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
  try {
    if (!isConnected || !sock) {
      console.log('❌ Groups API: WhatsApp not connected');
      return res.json({ groups: [], error: 'WhatsApp not connected' });
    }

    console.log('🔄 Fetching groups...');
    
    const groups = [];
    
    try {
      // Method 1: Try to get all participating groups
      console.log('Trying groupFetchAllParticipating...');
      const groupList = await sock.groupFetchAllParticipating();
      
      console.log(`📊 Found ${Object.keys(groupList).length} groups`);
      
      for (const [jid, group] of Object.entries(groupList)) {
        groups.push({
          id: jid,
          name: group.subject || 'Unknown Group',
          participantsCount: group.participants?.length || 0
        });
        console.log(`✅ Group: ${group.subject} (${group.participants?.length || 0} members)`);
      }
      
    } catch (error) {
      console.log('❌ groupFetchAllParticipating failed:', error.message);
      
      // Method 2: Try alternative approach
      try {
        console.log('Trying alternative group fetch...');
        if (sock.chats) {
          const chats = Object.values(sock.chats);
          const groupChats = chats.filter(chat => chat.id.endsWith('@g.us'));
          
          console.log(`📊 Found ${groupChats.length} group chats`);
          
          for (const chat of groupChats) {
            try {
              const groupInfo = await sock.groupMetadata(chat.id);
              groups.push({
                id: groupInfo.id,
                name: groupInfo.subject || 'Unknown Group',
                participantsCount: groupInfo.participants.length
              });
              console.log(`✅ Group: ${groupInfo.subject}`);
            } catch (metaError) {
              console.log(`⚠️ Could not fetch metadata for ${chat.id}`);
            }
          }
        }
      } catch (altError) {
        console.log('❌ Alternative method also failed:', altError.message);
      }
    }
    
    console.log(`🎯 Returning ${groups.length} groups total`);
    res.json({ 
      groups,
      total: groups.length,
      status: 'success'
    });
    
  } catch (error) {
    console.error('💥 Groups API error:', error);
    res.json({ 
      groups: [], 
      error: error.message,
      status: 'error'
    });
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Bot Server running on port ${PORT}`);
  console.log(`📱 Health: http://localhost:${PORT}/health`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  
  // Force new connection on startup
  console.log('🔄 Initializing WhatsApp connection...');
  initWhatsApp();
});

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
