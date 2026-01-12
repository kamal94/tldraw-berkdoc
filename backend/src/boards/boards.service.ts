import { Injectable, Logger } from '@nestjs/common';
import { BoardsRoomManager } from './boards.room-manager';
import { DatabaseService } from '../database/database.service';
import type { Document } from '../documents/entities/document.entity';
import type { Board } from './entities/board.entity';

const CARD_WIDTH = 300;
const CARD_HEIGHT = 140;
const GAP = 40;
const CARDS_PER_ROW = 3;

@Injectable()
export class BoardsService {
  private readonly logger = new Logger(BoardsService.name);

  constructor(
    private readonly roomManager: BoardsRoomManager,
    private readonly databaseService: DatabaseService
  ) {}

  /**
   * Get or create a board for a user.
   * Returns the board entity.
   */
  getOrCreateBoard(userId: string): Board | null {
    let boardRow = this.databaseService.findBoardByUserId(userId);

    if (!boardRow) {
      const boardId = crypto.randomUUID();
      this.databaseService.createBoard({ id: boardId, userId });
      boardRow = this.databaseService.findBoardByUserId(userId);
    }

    if (!boardRow) {
      return null;
    }

    return {
      id: boardRow.id,
      userId: boardRow.user_id,
      snapshot: boardRow.snapshot,
      createdAt: new Date(boardRow.created_at),
      updatedAt: new Date(boardRow.updated_at),
    };
  }

  /**
   * Add a document shape to a user's board.
   * This will be synced to all connected clients.
   */
  async addDocumentShape(userId: string, document: Document): Promise<void> {
    const room = await this.roomManager.getOrCreateRoom(userId);

    // Calculate position based on existing document shapes
    const existingShapes = room
      .getCurrentSnapshot()
      .documents.filter((doc) => {
        const state = doc.state as { typeName?: string };
        return state.typeName === 'shape';
      })
      .map((doc) => doc.state as { id: string; type?: string; x?: number; y?: number });

    const documentShapes = existingShapes.filter(
      (shape) => shape.type === 'document'
    );
    const shapeCount = documentShapes.length;

    // Calculate grid position
    const totalWidth = CARDS_PER_ROW * CARD_WIDTH + (CARDS_PER_ROW - 1) * GAP;
    const startX = -totalWidth / 2;
    const startY = -200;

    const row = Math.floor(shapeCount / CARDS_PER_ROW);
    const col = shapeCount % CARDS_PER_ROW;

    const x = startX + col * (CARD_WIDTH + GAP);
    const y = startY + row * (CARD_HEIGHT + GAP);

    // Create the shape ID in tldraw format
    const shapeId = `shape:${document.id}`;

    // Check if shape already exists
    const existingShape = room.getRecord(shapeId);
    if (existingShape) {
      this.logger.log(`Shape ${shapeId} already exists, skipping`);
      return;
    }

    // Add shape to the room store
    await room.updateStore((store) => {
      store.put({
        id: shapeId,
        typeName: 'shape',
        type: 'document',
        x,
        y,
        rotation: 0,
        index: `a${shapeCount}`,
        parentId: 'page:page',
        isLocked: false,
        opacity: 1,
        props: {
          w: CARD_WIDTH,
          h: CARD_HEIGHT,
          title: document.title,
          url: document.url || '',
          source: document.source,
          contributors: [],
          tags: document.tags || [],
          summary: document.summary || '',
        },
        meta: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    this.logger.log(`Added document shape ${shapeId} to user ${userId}'s board`);
  }

  /**
   * Remove a document shape from a user's board.
   */
  async removeDocumentShape(userId: string, documentId: string): Promise<void> {
    const room = this.roomManager.getRoom(userId);
    if (!room) {
      this.logger.warn(`No active room for user ${userId}`);
      return;
    }

    const shapeId = `shape:${documentId}`;

    await room.updateStore((store) => {
      const shape = store.get(shapeId);
      if (shape) {
        store.delete(shapeId);
        this.logger.log(`Removed document shape ${shapeId} from user ${userId}'s board`);
      }
    });
  }

  /**
   * Get the room for WebSocket connections.
   */
  async getRoomForConnection(userId: string) {
    return this.roomManager.getOrCreateRoom(userId);
  }
}
