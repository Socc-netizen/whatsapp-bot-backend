const express = require('express');
const cors = require('cors');

const app = express();
// Railway menggunakan PORT environment variable
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint (WAJIB untuk Railway)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'WhatsApp Bot Backend is RUNNING!',
    status: 'online'
  });
});

// Simple API endpoints
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'ready',
    connected: false,
    message: 'Backend ready for WhatsApp connection'
  });
});

// Start server dengan error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server successfully started on port ${PORT}`);
  console.log(`📍 Health check: http://0.0.0.0:${PORT}/health`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
