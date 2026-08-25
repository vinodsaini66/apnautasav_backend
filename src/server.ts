import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDatabase } from './config/database';
import { setupSwagger } from './config/swagger';
import logger from './utils/logger';
import routes from './routes';
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
// import { rateLimitMiddleware } from './middleware/rateLimit.middleware';
import mongoose from 'mongoose';
import { initializeSocket } from './config/socket';
import { createServer } from 'http';
import './cron/wedding';
// Load environment variables
dotenv.config();
mongoose.set("debug", true);

const app: Application = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Socket.IO
const socketServer = initializeSocket(httpServer);
app.set('socketServer', socketServer);

// Security middleware
app.use(helmet());
// app.use(cors({
//   origin: process.env.CORS_ORIGIN?.split(',') || '*',
//   credentials: true
// }));
app.use(cors({ origin: "*", credentials: false }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Sanitize data
app.use(mongoSanitize());

// Logging
app.use(loggingMiddleware);

// Rate limiting
// app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  console.log(req);

  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use(`/api/${process.env.API_VERSION || 'v1'}`, routes);

// Swagger documentation
setupSwagger(app);

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Start server
const startServer = async () => {
  try {
    await connectDatabase();

    // Must listen on `httpServer` (the one Socket.IO was attached to above),
    // not `app.listen(...)` — Express's own .listen() wraps `app` in a
    // second, separate http.Server that never has Socket.IO's upgrade
    // handling attached, so every /socket.io/* request 404s even though
    // the SocketServer log line above claims it's configured.
    httpServer.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();

export default app;