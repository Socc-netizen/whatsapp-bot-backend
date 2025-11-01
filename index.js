const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// SUPER SIMPLE - no cors, no middleware
app.get('/', (req, res) => {
  res.send('WhatsApp Bot BACKEND IS WORKING!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ready', connected: false });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ SERVER STARTED on port ' + PORT);
});

// No error handling, no graceful shutdown
