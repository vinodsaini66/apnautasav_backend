import express from 'express';
import { createServer } from 'http';
import { initializeSocket } from '../../src/config/socket';
import jwt from 'jsonwebtoken';
import routes from '../../src/routes';
import { User } from '../../src/models/user.model';
import logger from '../../src/utils/logger';

// Routes past the permission gate often fail validation on purpose in these
// tests; keep their error logs out of the output (and out of logs/).
logger.silent = true;

/** The real router stack, without server.ts's side effects (listen, crons, sockets). */
// Controllers emit realtime events through the shared Socket.IO server; give
// them one bound to an http server that never listens.
let socketReady = false;

export const buildApp = () => {
  if (!socketReady) {
    initializeSocket(createServer());
    socketReady = true;
  }
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  return app;
};

let counter = 0;

export const createUser = async (overrides: Partial<{ fullName: string; email: string; role: 'user' | 'admin' }> = {}) => {
  counter += 1;
  return User.create({
    fullName: overrides.fullName ?? `Test User ${counter}`,
    email: overrides.email ?? `user${counter}@test.in`,
    role: overrides.role ?? 'user',
    isVerified: true,
  });
};

export const tokenFor = (user: { _id: unknown; role?: string }) =>
  jwt.sign({ userId: String(user._id), phoneNumber: '', role: user.role ?? 'user' }, process.env.JWT_SECRET as string);

export const bearer = (user: { _id: unknown; role?: string }) => ({ Authorization: `Bearer ${tokenFor(user)}` });
