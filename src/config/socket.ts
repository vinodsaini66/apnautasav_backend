import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types';
import logger from '../utils/logger';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  phoneNumber?: string;
  role?: string;
}

export class SocketServer {
  private io: Server;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private weddingSockets: Map<string, Set<string>> = new Map(); // weddingId -> Set of socketIds

  constructor(httpServer: HTTPServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupRedisAdapter();
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private async setupRedisAdapter() {
    if (process.env.REDIS_URL) {
      try {
        const pubClient = new Redis(process.env.REDIS_URL);
        const subClient = pubClient.duplicate();

        this.io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter configured');
      } catch (error) {
        logger.error('Redis adapter setup failed:', error);
        logger.info('Socket.IO running without Redis adapter');
      }
    }
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;

        socket.userId = decoded.userId;
        socket.phoneNumber = decoded.phoneNumber;
        socket.role = decoded.role;

        logger.info(`Socket authenticated: ${socket.id} for user ${decoded.userId}`);
        next();
      } catch (error) {
        logger.error('Socket authentication failed:', error);
        next(new Error('Invalid authentication token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info(`Client connected: ${socket.id}, User: ${socket.userId}`);

      // Track user connection
      if (socket.userId) {
        if (!this.userSockets.has(socket.userId)) {
          this.userSockets.set(socket.userId, new Set());
        }
        this.userSockets.get(socket.userId)?.add(socket.id);
      }

      // Join user's personal room
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
        logger.info(`User ${socket.userId} joined personal room`);
      }

      // Handle joining wedding rooms
      socket.on('join:wedding', (weddingId: string) => {
        socket.join(`wedding:${weddingId}`);
        
        if (!this.weddingSockets.has(weddingId)) {
          this.weddingSockets.set(weddingId, new Set());
        }
        this.weddingSockets.get(weddingId)?.add(socket.id);

        logger.info(`User ${socket.userId} joined wedding room: ${weddingId}`);
        
        // Notify others in the room
        socket.to(`wedding:${weddingId}`).emit('user:joined', {
          userId: socket.userId,
          timestamp: new Date()
        });
      });

      // Handle leaving wedding rooms
      socket.on('leave:wedding', (weddingId: string) => {
        socket.leave(`wedding:${weddingId}`);
        this.weddingSockets.get(weddingId)?.delete(socket.id);

        logger.info(`User ${socket.userId} left wedding room: ${weddingId}`);
        
        socket.to(`wedding:${weddingId}`).emit('user:left', {
          userId: socket.userId,
          timestamp: new Date()
        });
      });

      // Handle typing indicators
      socket.on('typing:start', (data: { weddingId: string; entityType: string; entityId: string }) => {
        socket.to(`wedding:${data.weddingId}`).emit('typing:started', {
          userId: socket.userId,
          ...data,
          timestamp: new Date()
        });
      });

      socket.on('typing:stop', (data: { weddingId: string; entityType: string; entityId: string }) => {
        socket.to(`wedding:${data.weddingId}`).emit('typing:stopped', {
          userId: socket.userId,
          ...data,
          timestamp: new Date()
        });
      });

      // Handle real-time collaboration
      socket.on('note:editing', (data: { weddingId: string; noteId: string }) => {
        socket.to(`wedding:${data.weddingId}`).emit('note:being_edited', {
          userId: socket.userId,
          noteId: data.noteId,
          timestamp: new Date()
        });
      });

      // Handle presence
      socket.on('presence:update', (status: 'online' | 'away' | 'busy') => {
        if (socket.userId) {
          this.io.emit('presence:changed', {
            userId: socket.userId,
            status,
            timestamp: new Date()
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}, User: ${socket.userId}`);

        // Clean up tracking
        if (socket.userId) {
          this.userSockets.get(socket.userId)?.delete(socket.id);
          if (this.userSockets.get(socket.userId)?.size === 0) {
            this.userSockets.delete(socket.userId);
          }
        }

        // Clean up wedding rooms
        this.weddingSockets.forEach((sockets, weddingId) => {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            socket.to(`wedding:${weddingId}`).emit('user:disconnected', {
              userId: socket.userId,
              timestamp: new Date()
            });
          }
        });
      });

      // Error handling
      socket.on('error', (error) => {
        logger.error(`Socket error for user ${socket.userId}:`, error);
      });
    });
  }

  // Public methods to emit events

  public emitToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
    logger.info(`Emitted ${event} to user ${userId}`);
  }

  public emitToWedding(weddingId: string, event: string, data: any) {
    this.io.to(`wedding:${weddingId}`).emit(event, data);
    logger.info(`Emitted ${event} to wedding ${weddingId}`);
  }

  public emitToMultipleUsers(userIds: string[], event: string, data: any) {
    userIds.forEach(userId => {
      this.emitToUser(userId, event, data);
    });
  }

  public broadcastToWedding(weddingId: string, excludeUserId: string, event: string, data: any) {
    const sockets = this.weddingSockets.get(weddingId);
    if (sockets) {
      sockets.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket;
        if (socket && socket.userId !== excludeUserId) {
          socket.emit(event, data);
        }
      });
    }
  }

  public getOnlineUsers(weddingId: string): string[] {
    const sockets = this.weddingSockets.get(weddingId);
    const userIds = new Set<string>();
    
    if (sockets) {
      sockets.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket;
        if (socket?.userId) {
          userIds.add(socket.userId);
        }
      });
    }
    
    return Array.from(userIds);
  }

  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && (this.userSockets.get(userId)?.size || 0) > 0;
  }

  public getIO(): Server {
    return this.io;
  }
}

let socketServer: SocketServer | null = null;

export const initializeSocket = (httpServer: HTTPServer): SocketServer => {
  socketServer = new SocketServer(httpServer);
  return socketServer;
};

export const getSocketServer = (): SocketServer => {
  if (!socketServer) {
    throw new Error('Socket server not initialized');
  }
  return socketServer;
};