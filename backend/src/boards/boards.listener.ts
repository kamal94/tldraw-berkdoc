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
      // Fetch full document from database to get all fields
      const docRow = this.databaseService.findDocumentById(event.id);
      if (!docRow) {
        this.logger.warn(`Document ${event.id} not found in database`);
        return;
      }

      const document: Document = {
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

      // Add document shape to user's board
      await this.boardsService.addDocumentShape(event.userId, document);

      this.logger.log(
        `Added document shape for document ${event.id} to user ${event.userId}'s board`
      );
    } catch (error) {
      this.logger.error(`Failed to add document shape for ${event.id}:`, error);
    }
  }

  @OnEvent('document.deleted')
  async handleDocumentDeleted(event: DocumentDeletedEvent) {
    this.logger.log(`Handling document.deleted event for document ${event.id}`);

    try {
      // Remove document shape from user's board
      await this.boardsService.removeDocumentShape(event.userId, event.id);

      this.logger.log(
        `Removed document shape for document ${event.id} from user ${event.userId}'s board`
      );
    } catch (error) {
      this.logger.error(`Failed to remove document shape for ${event.id}:`, error);
    }
  }
}
