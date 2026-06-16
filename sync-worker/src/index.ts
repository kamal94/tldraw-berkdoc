import { jwtVerify } from 'jose';

export { BoardRoom } from './board-room';

export interface Env {
  /** Durable Object namespace hosting one tldraw room per board. */
  BOARD_ROOM: DurableObjectNamespace;
  /** Shared D1 database (board-access checks + snapshot persistence). */
  DB: D1Database;
  /** HMAC secret used to verify the app's JWTs (must match the backend). */
  JWT_SECRET: string;
}

/**
 * Worker entrypoint. Authenticates a WebSocket upgrade (JWT + D1 board
 * ownership), then forwards the connection to the per-board Durable Object.
 *
 * This mirrors the local NestJS sync gateway (`BoardsGateway`): same query
 * params (`?token=&boardId=`), same JWT/ownership checks, same per-board room
 * model -- only here the room lives in a Durable Object instead of in process.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade request', {
        status: 426,
      });
    }

    const token = url.searchParams.get('token');
    const boardId = url.searchParams.get('boardId');

    if (!token) {
      return new Response('Authentication required', { status: 401 });
    }
    if (!boardId) {
      return new Response('Board ID required', { status: 400 });
    }

    const userId = await verifyToken(token, env.JWT_SECRET);
    if (!userId) {
      return new Response('Authentication failed', { status: 401 });
    }

    const board = await env.DB.prepare(
      'SELECT user_id FROM boards WHERE id = ?',
    )
      .bind(boardId)
      .first<{ user_id: string }>();

    if (!board || board.user_id !== userId) {
      // Same response whether the board is missing or not owned, to avoid
      // leaking board existence.
      return new Response('Board not found', { status: 403 });
    }

    // Route to the single Durable Object instance for this board. All clients
    // editing the same board land on the same instance / in-memory room.
    const id = env.BOARD_ROOM.idFromName(boardId);
    const stub = env.BOARD_ROOM.get(id);

    // Pass the authenticated identity to the DO via the URL so it can build a
    // stable session id without re-verifying the token.
    const doUrl = new URL(request.url);
    doUrl.searchParams.set('userId', userId);

    return stub.fetch(new Request(doUrl.toString(), request));
  },
};

/**
 * Verify an HS256 JWT and return the subject (user id), or null if invalid.
 * Matches the backend's `@nestjs/jwt` defaults (HS256 over `JWT_SECRET`).
 */
async function verifyToken(
  token: string,
  jwtSecret: string,
): Promise<string | null> {
  try {
    const secret = new TextEncoder().encode(jwtSecret || 'default-secret');
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
