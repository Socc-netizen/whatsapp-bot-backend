const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic error handling
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/', (req, res) => {
  console.log('✅ Root endpoint hit');
  res.json({ 
    message: '🚀 WhatsApp Bot Backend is RUNNING!',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

app.get('/health', (req, res) => {
  console.log('✅ Health check hit');
  res.json({ 
    status: 'OK',
    service: 'WhatsApp Bot Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes untuk frontend
app.get('/api/status', (req, res) => {
  console.log('✅ API Status hit');
  res.json({ 
    status: 'disconnected', 
    connected: false,
    qr: null,
    message: 'Backend online - Ready for WhatsApp connection'
  });
});

app.get('/api/groups', (req, res) => {
  console.log('✅ API Groups hit');
  res.json({ 
    groups: [
      { 
        id: 'test-group-1', 
        name: 'Group Demo 1', 
        participantsCount: 25,
        isReadOnly: false
      },
      { 
        id: 'test-group-2', 
        name: 'Group Demo 2', 
        participantsCount: 15,
        isReadOnly: false
      }
    ],
    total: 2,
    message: 'Demo groups - Backend connected successfully'
  });
});

app.get('/api/connect', (req, res) => {
  console.log('✅ API Connect hit');
  res.json({ 
    status: 'need_qr',
    message: 'WhatsApp connection endpoint ready',
    qr: null
  });
});

// 404 Handler
app.use('*', (req, res) => {
  console.log('❌ 404 - Route not found:', req.originalUrl);
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    availableRoutes: [
      'GET  /',
      'GET  /health',
      'GET  /api/status',
      'GET  /api/groups',
      'GET  /api/connect'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('💥 Server Error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: error.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 WhatsApp Bot Server STARTED!');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🕒 Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});
