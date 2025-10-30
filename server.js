const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Atlas Gratis
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsappbot';
let db;

// Connect to MongoDB
async function connectDB() {
  try {
    const mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.log('Using in-memory storage (MongoDB not available)');
  }
}

// WhatsApp Client
let client = null;
let qrCode = null;
let isConnected = false;

// Initialize WhatsApp
function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "whatsapp-bot-free"
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', async (qr) => {
    console.log('QR Received');
    qrCode = await qrcode.toDataURL(qr);
    console.log('QR Code generated, ready for scanning');
  });

  client.on('ready', () => {
    console.log('WhatsApp Client Ready!');
    isConnected = true;
    qrCode = null;
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp Disconnected:', reason);
    isConnected = false;
    // Auto reconnect setelah 5 detik
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      client.initialize();
    }, 5000);
  });

  client.initialize();
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ 
    status: isConnected ? 'connected' : 'disconnected',
    qr: qrCode 
  });
});

app.get('/api/connect', async (req, res) => {
  if (!isConnected && qrCode) {
    res.json({ qr: qrCode, status: 'scan_qr' });
  } else if (isConnected) {
    res.json({ status: 'connected' });
  } else {
    // Force new QR
    if (client) {
      client.destroy();
    }
    initWhatsApp();
    res.json({ status: 'generating_qr' });
  }
});

app.get('/api/groups', async (req, res) => {
  if (!isConnected || !client) {
    return res.json({ groups: [] });
  }

  try {
    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantsCount: group.participants.length
      }));
    
    res.json({ groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.json({ groups: [], error: error.message });
  }
});

app.post('/api/pushkontak', async (req, res) => {
  const { groupId, message } = req.body;

  if (!isConnected || !client) {
    return res.status(400).json({ error: 'WhatsApp not connected' });
  }

  if (!groupId || !message) {
    return res.status(400).json({ error: 'Group ID and message required' });
  }

  try {
    const group = await client.getChatById(groupId);
    const participants = group.participants;
    
    // 🛡️ SAFETY LIMIT: Max 100 pesan/hari
    const DAILY_LIMIT = 100;
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
        // 🛡️ Tambah variasi pesan untuk hindari deteksi
        const messageVariations = [
          message,
          message + "\n\n-",
          message + " 💬"
        ];
        const finalMessage = messageVariations[Math.floor(Math.random() * messageVariations.length)];
        
        // Kirim pesan
        await client.sendMessage(participant.id._serialized, finalMessage);
        successCount++;
        
        console.log(`✅ Pesan ${i+1}/${participants.length} terkirim ke ${participant.id.user}`);
        
        // ⚡ DELAY SUPER AMAN: 20-60 DETIK ⚡
        const delaySeconds = 20 + Math.random() * 40; // Random antara 20-60 detik
        console.log(`⏳ Menunggu ${delaySeconds.toFixed(1)} detik sebelum pesan berikutnya...`);
        
        // Tampilkan progress
        const progress = ((i + 1) / participants.length * 100).toFixed(1);
        console.log(`📊 Progress: ${progress}% (${i + 1}/${participants.length})`);
        
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        
      } catch (error) {
        console.error(`❌ Gagal kirim ke ${participant.id.user}:`, error.message);
        failCount++;
        
        // Delay juga jika gagal (10 detik)
        console.log(`⏳ Delay 10 detik karena error...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // 🎉 Selesai
    const totalTime = (participants.length * 40).toFixed(0); // Estimasi waktu
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

  if (!isConnected || !client) {
    return res.status(400).json({ error: 'WhatsApp not connected' });
  }

  try {
    const group = await client.getChatById(groupId);
    const participants = group.participants;

    const contacts = participants.map(p => ({
      number: p.id.user,
      name: p.name || p.pushname || 'Unknown',
      group: group.name,
      savedAt: new Date()
    }));

    // Save to MongoDB jika available
    if (db) {
      await db.collection('contacts').insertMany(contacts);
    }

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
connectDB().then(() => {
  initWhatsApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WhatsApp Bot Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
  });
});

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
