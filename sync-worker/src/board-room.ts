import { TLSocketRoom } from '@tldraw/sync-core';
import type { StoreSchema, UnknownRecord } from '@tldraw/store';
import { createBerkdocTLSchema } from '../../backend/src/boards/berkdoc-schema';
import type { Env } from './index';

// One shared schema instance for all rooms. Imported from the backend so the
// Durable Object and the local NestJS gateway use a byte-identical schema -- a
// mismatch would corrupt sync. The wrangler `alias` config ensures the bundled
// schema resolves the worker's single @tldraw copy (no duplicate instances).
const schema = createBerkdocTLSchema() as unknown as StoreSchema<UnknownRecord>;

const PERSIST_DEBOUNCE_MS = 1000;

/**
 * Durable Object hosting a single tldraw `TLSocketRoom` for one board.
 *
 * Cloudflare routes every client for a given board (`idFromName(boardId)`) to
 * the same instance, so the in-memory room is authoritative -- the same model
 * the local NestJS `BoardsRoomManager` uses, just relocated into a DO.
 *
 * Snapshots are persisted to the shared D1 `boards.snapshot` column (debounced
 * on change) so the REST API keeps reading board snapshots exactly as before.
 */
export class BoardRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  private room: TLSocketRoom<UnknownRecord> | null = null;
  private boardId: string | null = null;
  private persistTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const boardId = url.searchParams.get('boardId');
    const userId = url.searchParams.get('userId') ?? 'anonymous';

    if (!boardId) {
      return new Response('Board ID required', { status: 400 });
    }

    const pair = new WebSocketPair();
    const clientSocket = pair[0];
    const serverSocket = pair[1];

    serverSocket.accept();

    try {
      const room = await this.getRoom(boardId);
      const sessionId = `${userId}:${crypto.randomUUID()}`;
      // Cloudflare's WebSocket is structurally compatible with tldraw's
      // `WebSocketMinimal` interface, so it is passed directly.
      room.handleSocketConnect({ sessionId, socket: serverSocket });
      console.log(`[BoardRoom] connected session ${sessionId} to ${boardId}`);
    } catch (err) {
      console.error('[BoardRoom] failed to connect socket:', err);
      try {
        serverSocket.close(1011, 'Internal error');
      } catch {
        // ignore
      }
    }

    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  /** Get (or lazily create) the room for this board, loading its snapshot. */
  private async getRoom(
    boardId: string,
  ): Promise<TLSocketRoom<UnknownRecord>> {
    if (this.room && !this.room.isClosed()) {
      return this.room;
    }

    this.boardId = boardId;

    const row = await this.env.DB.prepare(
      'SELECT snapshot FROM boards WHERE id = ?',
    )
      .bind(boardId)
      .first<{ snapshot: string | null }>();

    let initialSnapshot: ReturnType<TLSocketRoom<UnknownRecord>['getCurrentSnapshot']> | undefined;
    if (row?.snapshot) {
      try {
        initialSnapshot = JSON.parse(row.snapshot);
      } catch {
        // Corrupt snapshot: start the room empty rather than failing the
        // connection.
        initialSnapshot = undefined;
      }
    }

    this.room = new TLSocketRoom<UnknownRecord>({
      schema,
      initialSnapshot,
      onDataChange: () => this.schedulePersist(),
      onSessionRemoved: (room, args) => {
        if (args.numSessionsRemaining === 0) {
          // Flush any pending snapshot when the last client leaves.
          void this.persistSnapshot();
        }
      },
    });

    return this.room;
  }

  /** Debounced snapshot persistence to D1, mirroring the local gateway. */
  private schedulePersist(): void {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
    }
    this.persistTimeout = setTimeout(() => {
      void this.persistSnapshot();
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistSnapshot(): Promise<void> {
    const room = this.room;
    const boardId = this.boardId;
    if (!room || room.isClosed() || !boardId) {
      return;
    }

    const snapshot = room.getCurrentSnapshot();
    await this.env.DB.prepare(
      'UPDATE boards SET snapshot = ?, updated_at = ? WHERE id = ?',
    )
      .bind(JSON.stringify(snapshot), new Date().toISOString(), boardId)
      .run();
    console.log(`[BoardRoom] persisted snapshot for ${boardId}`);
  }
}
