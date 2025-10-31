const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// WhatsApp Client
let client = null;
let qrCode = null;
let isConnected = false;
let connectionStatus = 'disconnected';

// Initialize WhatsApp
const initWhatsApp = () => {
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "whatsapp-bot-server"
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
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1920,1080'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    },
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
  });

  client.on('qr', async (qr) => {
    console.log('📱 QR Received - Ready for scan');
    try {
      qrCode = await qrcode.toDataURL(qr);
      connectionStatus = 'scan_qr';
      console.log('✅ QR Code generated successfully');
    } catch (error) {
      console.error('❌ QR generation error:', error);
    }
  });

  client.on('ready', () => {
    console.log('✅ ✅ ✅ WhatsApp Client Ready!');
    console.log('🤖 Connected as:', client.info.pushname || 'Unknown');
    isConnected = true;
    connectionStatus = 'connected';
    qrCode = null;
  });

  client.on('authenticated', () => {
    console.log('🔐 WhatsApp Authenticated!');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Auth failure:', msg);
    connectionStatus = 'auth_failed';
  });

  client.on('disconnected', (reason) => {
    console.log('🔌 WhatsApp Disconnected:', reason);
    isConnected = false;
    connectionStatus = 'disconnected';
    // Auto reconnect setelah 5 detik
    setTimeout(() => {
      console.log('🔄 Attempting reconnect...');
      client.initialize();
    }, 5000);
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`🔄 Loading: ${percent}% - ${message}`);
  });

  client.initialize();
};

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ 
    status: connectionStatus,
    qr: qrCode,
    connected: isConnected
  });
});

app.get('/api/connect', async (req, res) => {
  if (!isConnected && qrCode) {
    res.json({ qr: qrCode, status: 'scan_qr' });
  } else if (isConnected) {
    res.json({ status: 'connected' });
  } else {
    // Force new connection
    if (client) {
      client.destroy();
    }
    initWhatsApp();
    res.json({ status: 'generating_qr' });
  }
});

app.get('/api/groups', async (req, res) => {
  if (!isConnected || !client) {
    return res.json({ groups: [], error: 'WhatsApp not connected' });
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
    
    console.log(`📊 Found ${groups.length} groups`);
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
    
    // Safety limit
    const DAILY_LIMIT = 50;
    if (participants.length > DAILY_LIMIT) {
      return res.status(400).json({ 
        error: `Maximum ${DAILY_LIMIT} pesan per hari` 
      });
    }
    
    let successCount = 0;
    let failCount = 0;

    console.log(`🚀 Starting push kontak to ${participants.length} participants`);

    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      
      try {
        await client.sendMessage(participant.id._serialized, message);
        successCount++;
        console.log(`✅ Message ${i+1}/${participants.length} sent to ${participant.id.user}`);
        
        // Delay 20-60 detik
        const delaySeconds = 20 + Math.random() * 40;
        console.log(`⏳ Waiting ${delaySeconds.toFixed(1)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        
      } catch (error) {
        console.error(`❌ Failed to send:`, error.message);
        failCount++;
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    res.json({ 
      success: true, 
      message: `Berhasil: ${successCount}, Gagal: ${failCount}` 
    });
    
  } catch (error) {
    console.error('Push kontak error:', error);
    res.status(500).json({ error: error.message });
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

// Health check
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
  console.log(`📱 Using whatsapp-web.js with puppeteer`);
  initWhatsApp();
});

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});
