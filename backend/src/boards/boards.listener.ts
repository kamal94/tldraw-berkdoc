import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BoardsService } from './boards.service';
import { DatabaseService } from '../database/database.service';
import {
  DocumentCreatedEvent,
  DocumentDeletedEvent,
} from '../ingestion/events/document.events';
import type { Document } from '../documents/entities/document.entity';

@Injectable()
export class BoardsListener {
  private readonly logger = new Logger(BoardsListener.name);

  constructor(
    private readonly boardsService: BoardsService,
    private readonly databaseService: DatabaseService
  ) {}

  @OnEvent('document.created')
  async handleDocumentCreated(event: DocumentCreatedEvent) {
    this.logger.log(`Handling document.created event for document ${event.id}`);

    try {
      const boards = this.boardsService.listBoards(event.userId);
      const targetBoard = boards[0];
      if (!targetBoard) return;

      const document = this.getDocumentFromDatabase(event.id);
      if (!document) return;

      await this.boardsService.addDocumentShape(targetBoard.id, document);

      this.logger.log(
        `Added document shape for document ${event.id} to board ${targetBoard.id}`
      );
    } catch (error) {
      this.logger.error(`Failed to add document shape for ${event.id}:`, error);
    }
  }

  private getDocumentFromDatabase(documentId: string): Document | null {
    const docRow = this.databaseService.findDocumentById(documentId);
    if (!docRow) {
      this.logger.warn(`Document ${documentId} not found in database`);
      return null;
    }

    return {
      id: docRow.id,
      title: docRow.title,
      content: docRow.content,
      url: docRow.url || undefined,
      source: docRow.source,
      userId: docRow.user_id,
      tags: docRow.tags ? JSON.parse(docRow.tags) : [],
      summary: docRow.summary || undefined,
      createdAt: new Date(docRow.created_at),
      updatedAt: new Date(docRow.updated_at),
    };
  }

  @OnEvent('document.deleted')
  async handleDocumentDeleted(event: DocumentDeletedEvent) {
    this.logger.log(`Handling document.deleted event for document ${event.id}`);

    try {
      const boards = this.boardsService.listBoards(event.userId);
      if (boards.length === 0) return;

      for (const board of boards) {
        await this.boardsService.removeDocumentShape(board.id, event.id);
      }

      this.logger.log(
        `Removed document shape for document ${event.id} from all boards for user ${event.userId}`
      );
    } catch (error) {
      this.logger.error(`Failed to remove document shape for ${event.id}:`, error);
    }
  }
}
