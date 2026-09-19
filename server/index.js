const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { persistenceDriver } = require('./lib/store');
const { authProvider, authProviderName } = require('./lib/authProvider');
const { runMigrationsIfNeeded } = require('./lib/migrationRunner');

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST']
  }
});

app.use(helmet());
app.use(morgan('combined'));
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Routes
const { router: apiRoutes, setIo } = require('./routes/api');
app.use('/api/v1', apiRoutes);
setIo(io);

// Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    requestId: req.headers['x-request-id'] || null
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  runMigrationsIfNeeded()
    .then((migrationResult) => {
      if (migrationResult?.skipped) {
        console.log('Migrations: skipped');
      } else if (migrationResult?.applied?.length > 0) {
        console.log(`Migrations applied: ${migrationResult.applied.join(', ')}`);
      } else {
        console.log('Migrations: no pending files');
      }

      return authProvider.init();
    })
    .then(() => {
      server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Allowed client origin: ${allowedOrigin}`);
        console.log(`Persistence driver: ${persistenceDriver}`);
        console.log(`Auth provider: ${authProviderName}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize auth provider', err);
      process.exit(1);
    });
}

module.exports = { app, server };
