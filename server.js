const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// WhatsApp Client Configuration
let client = null;
let qrCode = null;
let isConnected = false;
let connectionStatus = 'disconnected';

// Initialize WhatsApp Client
const initWhatsApp = () => {
  console.log('🚀 Initializing WhatsApp Client...');
  
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
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    },
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
  });

  // Event Handlers
  client.on('qr', async (qr) => {
    console.log('📱 QR Code Received - Ready for scanning');
    try {
      qrCode = await qrcode.toDataURL(qr);
      connectionStatus = 'scan_qr';
      console.log('✅ QR Code generated successfully');
    } catch (error) {
      console.error('❌ QR Code generation error:', error);
    }
  });

  client.on('ready', () => {
    console.log('✅ ✅ ✅ WhatsApp Client is READY!');
    console.log('🤖 Connected as:', client.info.pushname || 'Unknown');
    console.log('📱 Phone number:', client.info.wid.user || 'Unknown');
    isConnected = true;
    connectionStatus = 'connected';
    qrCode = null;
  });

  client.on('authenticated', () => {
    console.log('🔐 WhatsApp Authenticated Successfully!');
    connectionStatus = 'authenticated';
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication Failed:', msg);
    connectionStatus = 'auth_failed';
    isConnected = false;
  });

  client.on('disconnected', (reason) => {
    console.log('🔌 WhatsApp Disconnected:', reason);
    isConnected = false;
    connectionStatus = 'disconnected';
    qrCode = null;
    
    // Auto-reconnect after 10 seconds
    console.log('🔄 Attempting to reconnect in 10 seconds...');
    setTimeout(() => {
      if (client) {
        console.log('🔄 Reinitializing WhatsApp Client...');
        client.initialize();
      }
    }, 10000);
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`🔄 Loading Screen: ${percent}% - ${message}`);
  });

  client.on('message', async (msg) => {
    // Basic auto-reply for testing
    if (msg.body.toLowerCase() === 'ping') {
      await msg.reply('🏓 Pong! Bot is working!');
    }
  });

  // Initialize the client
  client.initialize().catch(error => {
    console.error('❌ Failed to initialize WhatsApp client:', error);
  });
};

// API Routes

// Health Check
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Bot Backend is Running!',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/status - Check WhatsApp connection status',
      '/api/connect - Generate QR code',
      '/api/groups - Get group list',
      '/health - Health check'
    ]
  });
});

// WhatsApp Status
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    connected: isConnected,
    hasQr: !!qrCode,
    timestamp: new Date().toISOString()
  });
});

// Connect/Generate QR
app.get('/api/connect', async (req, res) => {
  try {
    if (isConnected) {
      return res.json({
        status: 'connected',
        message: 'WhatsApp is already connected'
      });
    }

    if (qrCode) {
      return res.json({
        status: 'scan_qr',
        qr: qrCode,
        message: 'QR code ready for scanning'
      });
    }

    // If no client or QR, reinitialize
    if (!client) {
      initWhatsApp();
      return res.json({
        status: 'initializing',
        message: 'Initializing WhatsApp client...'
      });
    }

    // Force new QR generation
    if (client) {
      await client.destroy();
      initWhatsApp();
      return res.json({
        status: 'generating_qr',
        message: 'Generating new QR code...'
      });
    }
  } catch (error) {
    console.error('Connect error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Get Groups
app.get('/api/groups', async (req, res) => {
  if (!isConnected || !client) {
    return res.status(400).json({
      groups: [],
      error: 'WhatsApp is not connected',
      status: connectionStatus
    });
  }

  try {
    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantsCount: group.participants.length,
        isReadOnly: group.isReadOnly
      }));

    console.log(`📊 Found ${groups.length} groups`);
    
    res.json({
      groups,
      total: groups.length,
      status: 'success'
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({
      groups: [],
      error: error.message,
      status: 'error'
    });
  }
});

// Push Kontak to Group Members
app.post('/api/pushkontak', async (req, res) => {
  const { groupId, message } = req.body;

  if (!isConnected || !client) {
    return res.status(400).json({
      error: 'WhatsApp is not connected',
      status: connectionStatus
    });
  }

  if (!groupId || !message) {
    return res.status(400).json({
      error: 'Group ID and message are required'
    });
  }

  try {
    const group = await client.getChatById(groupId);
    const participants = group.participants;

    // Safety limits
    const DAILY_LIMIT = 50;
    const MAX_PARTICIPANTS = 100;

    if (participants.length > MAX_PARTICIPANTS) {
      return res.status(400).json({
        error: `Group has too many participants (${participants.length}). Maximum allowed: ${MAX_PARTICIPANTS}`
      });
    }

    if (participants.length > DAILY_LIMIT) {
      return res.status(400).json({
        error: `Maximum ${DAILY_LIMIT} messages per day allowed`
      });
    }

    let successCount = 0;
    let failCount = 0;
    const results = [];

    console.log(`🚀 Starting push kontak to ${participants.length} participants`);

    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      const participantNumber = participant.id.user;

      try {
        await client.sendMessage(participant.id._serialized, message);
        successCount++;
        results.push({
          number: participantNumber,
          status: 'success',
          index: i + 1
        });
        
        console.log(`✅ Message ${i + 1}/${participants.length} sent to ${participantNumber}`);
        
        // Random delay between 20-60 seconds
        const delaySeconds = 20 + Math.random() * 40;
        console.log(`⏳ Waiting ${delaySeconds.toFixed(1)} seconds before next message...`);
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        
      } catch (error) {
        failCount++;
        results.push({
          number: participantNumber,
          status: 'failed',
          error: error.message,
          index: i + 1
        });
        
        console.error(`❌ Failed to send to ${participantNumber}:`, error.message);
        
        // Shorter delay on failure
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    res.json({
      success: true,
      message: `Campaign completed: ${successCount} successful, ${failCount} failed`,
      summary: {
        total: participants.length,
        success: successCount,
        failed: failCount
      },
      results: results
    });
    
  } catch (error) {
    console.error('Push kontak error:', error);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// Save Contacts from Group
app.post('/api/save-contacts', async (req, res) => {
  const { groupId } = req.body;

  if (!isConnected || !client) {
    return res.status(400).json({
      error: 'WhatsApp is not connected'
    });
  }

  if (!groupId) {
    return res.status(400).json({
      error: 'Group ID is required'
    });
  }

  try {
    const group = await client.getChatById(groupId);
    const participants = group.participants;

    const contacts = participants.map(p => ({
      number: p.id.user,
      name: p.name || p.pushname || 'Unknown',
      group: group.name,
      savedAt: new Date().toISOString()
    }));

    res.json({
      success: true,
      saved: contacts.length,
      group: group.name,
      contacts: contacts
    });
    
  } catch (error) {
    console.error('Save contacts error:', error);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'WhatsApp Bot Backend',
    timestamp: new Date().toISOString(),
    whatsapp: {
      status: connectionStatus,
      connected: isConnected
    },
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled Error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: error.message
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET  /',
      'GET  /api/status',
      'GET  /api/connect',
      'GET  /api/groups',
      'POST /api/pushkontak',
      'POST /api/save-contacts',
      'GET  /health'
    ]
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Bot Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🕒 Started at: ${new Date().toISOString()}`);
  
  // Initialize WhatsApp client when server starts
  initWhatsApp();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
