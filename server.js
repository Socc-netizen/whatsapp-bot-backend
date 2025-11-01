const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 WhatsApp Bot Backend is RUNNING!',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    service: 'WhatsApp Bot Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test API route untuk frontend
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'disconnected', 
    connected: false,
    qr: null,
    message: 'Backend online, WhatsApp not initialized'
  });
});

app.get('/api/groups', (req, res) => {
  res.json({ 
    groups: [
      { id: 'test-1', name: 'Group Test 1', participantsCount: 10 },
      { id: 'test-2', name: 'Group Test 2', participantsCount: 15 }
    ],
    message: 'Demo groups - backend connected successfully'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Health: http://0.0.0.0:${PORT}/health`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});
