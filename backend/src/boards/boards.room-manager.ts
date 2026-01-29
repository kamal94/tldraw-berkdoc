import { Injectable, Logger } from '@nestjs/common';
import { TLSocketRoom, RoomSnapshot } from '@tldraw/sync-core';
import type { UnknownRecord } from '@tldraw/store';
import { DatabaseService } from '../database/database.service';
import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema';
import { T } from '@tldraw/validate';

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

// Define validators for DocumentShapeProps
const documentShapeProps = {
	w: T.number,
	h: T.number,
	title: T.string,
	url: T.string,
	source: T.string.optional().nullable(),
	contributors: T.arrayOf(
		T.object({
			name: T.string,
			avatarUrl: T.string.optional(),
			color: T.string,
      email: T.string.optional().nullable(),
		})
	),
	tags: T.arrayOf(T.string),
	summary: T.string.optional(),
} as const;

const collectionShapeProps = {
	w: T.number,
	h: T.number,
	label: T.string,
	documentIds: T.arrayOf(T.string),
} as const;

export const schema = createTLSchema({
	shapes: {
		...defaultShapeSchemas,

		document: {
			props: documentShapeProps,
		},
		collection: {
			props: collectionShapeProps,
		},
	},
	bindings: defaultBindingSchemas,
})

@Injectable()
export class BoardsRoomManager {
  private readonly logger = new Logger(BoardsRoomManager.name);
  private readonly rooms = new Map<string, TLSocketRoom<UnknownRecord>>();
  private readonly persistFns = new Map<string, () => void>();

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get or create a TLSocketRoom for a board.
   * Loads the board snapshot from the database if it exists.
   */
  async getOrCreateRoom(boardId: string): Promise<TLSocketRoom<UnknownRecord>> {
    // Check if room already exists in memory
    const existingRoom = this.rooms.get(boardId);
    if (existingRoom && !existingRoom.isClosed()) {
      return existingRoom;
    }

    // Load board from database
    const boardRow = this.databaseService.findBoardById(boardId);
    let initialSnapshot: RoomSnapshot | undefined;

    if (!boardRow) {
      this.logger.error(`Board ${boardId} not found in database`);
      throw new Error(`Board ${boardId} not found`);
    }

    if (boardRow.snapshot) {
      try {
        initialSnapshot = JSON.parse(boardRow.snapshot) as RoomSnapshot;
        this.logger.log(`Loaded board snapshot for board ${boardId}`);
      } catch (error) {
        this.logger.error(`Failed to parse snapshot for board ${boardId}:`, error);
      }
    }

    // Create debounced persist function
    const persistSnapshot = debounce(() => {
      const room = this.rooms.get(boardId);
      if (room && !room.isClosed()) {
        const snapshot = room.getCurrentSnapshot();
        this.databaseService.updateBoardSnapshot(boardId, JSON.stringify(snapshot));
        this.logger.debug(`Persisted snapshot for board ${boardId}`);
      }
    }, 1000);

    this.persistFns.set(boardId, persistSnapshot);

    // Create the room (uses default tldraw schema)
    const room = new TLSocketRoom<UnknownRecord>({
      schema,
      initialSnapshot,
      log: {
        warn: (...args: unknown[]) => this.logger.warn(args.join(' ')),
        error: (...args: unknown[]) => this.logger.error(args.join(' ')),
      },
      onDataChange: () => {
        // Persist on data change (debounced)
        persistSnapshot();
      },
      onSessionRemoved: (_room, { sessionId, numSessionsRemaining }) => {
        this.logger.log(
          `Session ${sessionId} removed from board ${boardId}'s room. ` +
            `${numSessionsRemaining} sessions remaining.`
        );

        // Optionally clean up room when no sessions remain
        // For now, we keep the room in memory for faster reconnection
      },
    });

    this.rooms.set(boardId, room);
    this.logger.log(`Created room for board ${boardId}`);

    return room;
  }

  /**
   * Get an existing room for a board.
   * Returns undefined if no room exists.
   */
  getRoom(boardId: string): TLSocketRoom<UnknownRecord> | undefined {
    const room = this.rooms.get(boardId);
    if (room && room.isClosed()) {
      this.rooms.delete(boardId);
      this.persistFns.delete(boardId);
      return undefined;
    }
    return room;
  }

  /**
   * Dispose of a room and persist its final state.
   */
  disposeRoom(boardId: string): void {
    const room = this.rooms.get(boardId);
    if (room && !room.isClosed()) {
      // Final persist before closing
      const snapshot = room.getCurrentSnapshot();
      this.databaseService.updateBoardSnapshot(boardId, JSON.stringify(snapshot));
      room.close();
    }
    this.rooms.delete(boardId);
    this.persistFns.delete(boardId);
    this.logger.log(`Disposed room for board ${boardId}`);
  }

  /**
   * Get all active room board IDs.
   */
  getActiveRoomBoardIds(): string[] {
    return Array.from(this.rooms.keys()).filter((boardId) => {
      const room = this.rooms.get(boardId);
      return room && !room.isClosed();
    });
  }

  /**
   * Dispose all rooms (for shutdown).
   */
  disposeAllRooms(): void {
    for (const boardId of this.rooms.keys()) {
      this.disposeRoom(boardId);
    }
  }
}
