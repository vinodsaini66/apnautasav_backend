import { Namespace, Server } from 'socket.io';
import { VendorUser } from '../../models/vendor-os/vendor-user.model';
import { verifyVendorAccessToken } from './vendor-auth.service';
import logger from '../../utils/logger';

// Live updates for the Vendor OS panel on the `/vendor-os` Socket.IO
// namespace. The family app's default namespace authenticates family JWTs;
// this one takes Vendor OS access tokens (own secret + audience), checked
// the same way as middleware/vendor-auth.middleware.ts.
//
// Rooms:
//   vuser:<vendorUserId>        — one login (all its tabs / devices)
//   vendor:<vendorId>:managers  — owner + manager logins of a business
// A notification without vendorUserId goes to the managers room, matching
// who gets its push and who sees it in the bell.

let nsp: Namespace | null = null;

const MANAGER_ROLES = ['owner', 'manager'];

export const userRoom = (vendorUserId: string) => `vuser:${vendorUserId}`;
export const managersRoom = (vendorId: string) => `vendor:${vendorId}:managers`;

export function attachVendorRealtime(io: Server): void {
  nsp = io.of('/vendor-os');

  nsp.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || String(socket.handshake.headers.authorization || '');
      const decoded = verifyVendorAccessToken(raw.replace(/^Bearer\s+/i, ''));
      const user = await VendorUser.findById(decoded.vendorUserId).select('vendorId role status tokenVersion').lean();
      if (!user || user.status === 'disabled' || !user.vendorId || (decoded.tv ?? 0) !== (user.tokenVersion || 0)) {
        return next(new Error('Unauthorized'));
      }
      socket.data.vendorUserId = String(user._id);
      socket.data.vendorId = String(user.vendorId);
      socket.data.role = user.role;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  nsp.on('connection', (socket) => {
    const { vendorUserId, vendorId, role } = socket.data as { vendorUserId: string; vendorId: string; role: string };
    socket.join(userRoom(vendorUserId));
    if (MANAGER_ROLES.includes(role)) socket.join(managersRoom(vendorId));
  });

  logger.info('Vendor OS realtime namespace /vendor-os ready');
}

/** Sends an event to one login, or to the owner/manager logins of a business. Never throws. */
export function emitToVendor(target: { vendorId: string; vendorUserId?: string | null }, event: string, payload: unknown): number {
  if (!nsp) return 0;
  try {
    const room = target.vendorUserId ? userRoom(target.vendorUserId) : managersRoom(target.vendorId);
    nsp.to(room).emit(event, payload);
    return nsp.adapter.rooms.get(room)?.size || 0;
  } catch (error) {
    logger.warn('Vendor OS realtime emit failed', error);
    return 0;
  }
}

/** Drops a login's open sockets (role change, access paused, removed) so it reconnects with its new rights. */
export function disconnectVendorUser(vendorUserId: string): void {
  try {
    nsp?.in(userRoom(vendorUserId)).disconnectSockets(true);
  } catch (error) {
    logger.warn('Vendor OS realtime disconnect failed', error);
  }
}
