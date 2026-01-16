import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BoardsRoomManager } from './boards.room-manager';
import { DatabaseService } from '../database/database.service';
import type { Document } from '../documents/entities/document.entity';
import type { Board } from './entities/board.entity';
import type { DocumentShapeProps, DocumentSource } from '../../../shared/document-shape.types';
import { TLBaseShape } from '@tldraw/tlschema';
import { generateKeyBetween } from 'fractional-indexing';
import type { RoomSnapshot } from '@tldraw/sync-core';
import { validateShape } from './shape-validator.util';
import { emailToColor } from './utils/color.utils';

const CARD_WIDTH = 300;
const CARD_HEIGHT = 140;
const GAP = 40;
const CARDS_PER_ROW = 3;
const DEFAULT_PAGE_ID = 'page:page';

@Injectable()
export class BoardsService {
  private readonly logger = new Logger(BoardsService.name);

  constructor(
    private readonly roomManager: BoardsRoomManager,
    private readonly databaseService: DatabaseService
  ) {}

  listBoards(userId: string): Board[] {
    const rows = this.databaseService.findBoardsByUserId(userId);
    if (rows.length === 0) {
      return [this.createBoard(userId, 'My Board')];
    }
    return rows.map((row) => this.rowToBoard(row));
  }

  createBoard(userId: string, name?: string): Board {
    const boardId = crypto.randomUUID();
    this.databaseService.createBoard({ id: boardId, userId, name });
    const boardRow = this.databaseService.findBoardById(boardId);
    if (!boardRow) {
      throw new NotFoundException('Board not found after creation');
    }
    return this.rowToBoard(boardRow);
  }

  getBoardById(boardId: string, userId: string): Board {
    const boardRow = this.databaseService.findBoardById(boardId);
    if (!boardRow || boardRow.user_id !== userId) {
      throw new NotFoundException('Board not found');
    }
    return this.rowToBoard(boardRow);
  }

  updateBoardName(userId: string, boardId: string, name?: string): Board {
    const board = this.getBoardById(boardId, userId);
    if (!name) return board;

    this.databaseService.updateBoardName(boardId, name);
    const updatedRow = this.databaseService.findBoardById(boardId);
    if (!updatedRow) {
      throw new NotFoundException('Board not found');
    }
    return this.rowToBoard(updatedRow);
  }

  deleteBoard(userId: string, boardId: string): void {
    this.getBoardById(boardId, userId);
    this.databaseService.deleteBoard(boardId);
  }

  /**
   * Add a document shape to a user's board.
   * This will be synced to all connected clients.
   */
  async addDocumentShape(boardId: string, document: Document): Promise<void> {
    const room = await this.roomManager.getOrCreateRoom(boardId);
    const shapeId = `shape:${document.id}`;

    // Check if shape already exists
    const existingShape = room.getRecord(shapeId);
    if (existingShape) {
      this.logger.log(`Shape ${shapeId} already exists, skipping`);
      return;
    }

    const snapshot = room.getCurrentSnapshot();
    const pageId = this.findPageId(snapshot);
    const existingShapes = this.getExistingDocumentShapes(snapshot);
    const shapeCount = existingShapes.length;
    const index = this.generateShapeIndex(existingShapes);
    const position = this.calculateShapePosition(shapeCount);
    const documentShape = this.createDocumentShape(
      document,
      shapeId,
      pageId,
      position,
      index
    );

    // Validate the shape before adding it to the board
    const validationResult = validateShape(documentShape);
    this.logger.debug(`Validation result: ${JSON.stringify(validationResult, null, 2)}`);
    if (!validationResult.valid) {
      this.logger.error(`Shape validation failed for document ${document.id} (${document.title}): ${validationResult.error}`);
      throw new Error(`Shape validation failed for document ${document.id} (${document.title}): ${validationResult.error}`);
    }

    this.logger.debug(`Adding document shape ${shapeId} to board ${boardId}`);
    await room.updateStore((store) => {
      store.put(documentShape);
    });

    this.logger.log(`Added document shape ${shapeId} to board ${boardId}`);
  }

  /**
   * Find the page ID from a room snapshot.
   * First tries to get it from existing shapes' parentId, otherwise finds the first page record.
   */
  private findPageId(snapshot: RoomSnapshot): string {
    // Try to find page ID from existing shapes
    const shapeWithParent = snapshot.documents.find((doc) => {
      const state = doc.state as { typeName?: string; parentId?: string };
      return state.typeName === 'shape' && state.parentId?.startsWith('page:');
    });

    if (shapeWithParent) {
      const parentId = (shapeWithParent.state as unknown as { parentId: string }).parentId;
      return parentId;
    }

    // No shapes yet, find the first page record
    const pageRecord = snapshot.documents.find((doc) => {
      const state = doc.state as { typeName?: string; id?: string };
      return state.typeName === 'page' && state.id?.startsWith('page:');
    });

    if (pageRecord) {
      return (pageRecord.state as { id: string }).id;
    }

    return DEFAULT_PAGE_ID;
  }

  /**
   * Get all existing document shapes from a snapshot.
   */
  private getExistingDocumentShapes(
    snapshot: RoomSnapshot
  ): Array<{ id: string; index?: string }> {
    return snapshot.documents
      .filter((doc) => {
        const state = doc.state as { typeName?: string; type?: string };
        return state.typeName === 'shape' && state.type === 'document';
      })
      .map((doc) => doc.state as { id: string; index?: string });
  }

  /**
   * Generate a fractional index for a new shape based on existing shapes.
   */
  private generateShapeIndex(
    existingShapes: Array<{ index?: string }>
  ): string {
    const existingIndices = existingShapes
      .map((shape) => shape.index)
      .filter((index): index is string => typeof index === 'string')
      .sort();

    const lastIndex =
      existingIndices.length > 0
        ? existingIndices[existingIndices.length - 1]
        : null;
    return generateKeyBetween(lastIndex, null);
  }

  /**
   * Calculate grid position for a new shape based on the number of existing shapes.
   */
  private calculateShapePosition(shapeCount: number): { x: number; y: number } {
    const totalWidth = CARDS_PER_ROW * CARD_WIDTH + (CARDS_PER_ROW - 1) * GAP;
    const startX = -totalWidth / 2;
    const startY = -200;

    const row = Math.floor(shapeCount / CARDS_PER_ROW);
    const col = shapeCount % CARDS_PER_ROW;

    const x = startX + col * (CARD_WIDTH + GAP);
    const y = startY + row * (CARD_HEIGHT + GAP);

    return { x, y };
  }

  /**
   * Create a document shape object ready to be added to the board.
   */
  private createDocumentShape(
    document: Document,
    shapeId: string,
    pageId: string,
    position: { x: number; y: number },
    index: string
  ): TLBaseShape<'document', DocumentShapeProps> {
    const props: DocumentShapeProps = {
      w: CARD_WIDTH,
      h: CARD_HEIGHT,
      title: document.title,
      url: document.url || '',
      source: document.source ? (document.source as DocumentSource) : undefined,
      contributors: document.collaborators?.map((c) => ({
        email: c.email || '',
        name: c.name,
        avatarUrl: c.avatarUrl || '',
        color: emailToColor(c.email || '')
      })) || [],
      tags: document.tags || [],
      summary: document.summary || undefined,
    };

    // Serialize and deserialize props and meta to ensure they're JSON-serializable
    // This is required by T.jsonValue validator
    const serializedProps = JSON.parse(JSON.stringify(props));
    const serializedMeta = JSON.parse(JSON.stringify({}));

    return {
      id: shapeId,
      typeName: 'shape',
      type: 'document',
      x: position.x,
      y: position.y,
      rotation: 0,
      index,
      parentId: pageId,
      isLocked: false,
      opacity: 1,
      props: serializedProps,
      meta: serializedMeta,
    } as TLBaseShape<'document', DocumentShapeProps>;
  }

  /**
   * Remove a document shape from a user's board.
   */
  async removeDocumentShape(boardId: string, documentId: string): Promise<void> {
    const room = this.roomManager.getRoom(boardId);
    if (!room) {
      this.logger.warn(`No active room for board ${boardId}`);
      return;
    }

    const shapeId = `shape:${documentId}`;

    await room.updateStore((store) => {
      const shape = store.get(shapeId);
      if (shape) {
        store.delete(shapeId);
        this.logger.log(`Removed document shape ${shapeId} from board ${boardId}`);
      }
    });
  }

  /**
   * Get the room for WebSocket connections.
   */
  async getRoomForConnection(boardId: string) {
    return this.roomManager.getOrCreateRoom(boardId);
  }

  private rowToBoard(row: {
    id: string;
    user_id: string;
    name: string;
    snapshot: string | null;
    created_at: string;
    updated_at: string;
  }): Board {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      snapshot: row.snapshot,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}