const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check (WAJIB untuk Docker)
app.get('/health', (req, res) => {
  console.log('✅ Health check passed');
  res.status(200).json({ 
    status: 'OK',
    message: 'WhatsApp Bot Backend is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 WhatsApp Bot Backend Docker Edition',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'ready',
    connected: false,
    message: 'Backend running in Docker'
  });
});

app.get('/api/groups', (req, res) => {
  res.json({
    groups: [
      { id: '1', name: 'Demo Group 1', participantsCount: 10 },
      { id: '2', name: 'Demo Group 2', participantsCount: 15 }
    ]
  });
});

// Error handling
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🐳 WhatsApp Bot running in DOCKER');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🕒 Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
