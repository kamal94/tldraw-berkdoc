import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService, type DocumentRow } from '../database/database.service';
import type { Document } from './entities/document.entity';
import type { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';
import {
  DocumentCreatedEvent,
  DocumentUpdatedEvent,
  DocumentDeletedEvent,
} from '../ingestion/events/document.events';

@Injectable()
export class DocumentsService {
  constructor(
    private eventEmitter: EventEmitter2,
    private databaseService: DatabaseService,
  ) {}

  async create(userId: string, dto: CreateDocumentDto): Promise<Document> {
    const document: Document = {
      id: this.generateId(),
      title: dto.title,
      content: dto.content,
      url: dto.url,
      source: dto.source,
      userId,
      dimensions: dto.dimensions || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.databaseService.createDocument({
      id: document.id,
      title: document.title,
      content: document.content,
      url: document.url,
      source: document.source,
      userId: document.userId,
      dimensions: document.dimensions,
      googleFileId: dto.googleFileId,
      googleModifiedTime: dto.googleModifiedTime,
    });

    // Emit event for ingestion pipeline
    this.eventEmitter.emit(
      'document.created',
      new DocumentCreatedEvent(
        document.id,
        document.title,
        document.content,
        document.source,
        userId,
      ),
    );

    return document;
  }

  async findAll(userId: string): Promise<Document[]> {
    const rows = this.databaseService.findDocumentsByUserId(userId);
    return rows.map((row) => this.rowToDocument(row));
  }

  async findOne(userId: string, documentId: string): Promise<Document> {
    const row = this.databaseService.findDocumentById(documentId);

    if (!row || row.user_id !== userId) {
      throw new NotFoundException('Document not found');
    }

    return this.rowToDocument(row);
  }

  async update(userId: string, documentId: string, dto: UpdateDocumentDto): Promise<Document> {
    const existing = await this.findOne(userId, documentId);
    const contentChanged = dto.content && dto.content !== existing.content;

    // Update in database
    this.databaseService.updateDocument(documentId, {
      title: dto.title,
      content: dto.content,
      url: dto.url,
      source: dto.source,
      dimensions: dto.dimensions,
      googleFileId: dto.googleFileId,
      googleModifiedTime: dto.googleModifiedTime,
    });

    // Get updated document
    const updatedRow = this.databaseService.findDocumentById(documentId)!;
    const document = this.rowToDocument(updatedRow);

    // If content changed, emit event for re-ingestion
    if (contentChanged) {
      this.eventEmitter.emit(
        'document.updated',
        new DocumentUpdatedEvent(
          document.id,
          document.title,
          document.content,
          document.source,
          userId,
        ),
      );
    }

    return document;
  }

  async remove(userId: string, documentId: string): Promise<void> {
    // Verify ownership
    await this.findOne(userId, documentId);

    this.databaseService.deleteDocument(documentId);

    // Emit event to remove from vector store
    this.eventEmitter.emit('document.deleted', new DocumentDeletedEvent(documentId, userId));
  }

  private rowToDocument(row: DocumentRow): Document {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      url: row.url || undefined,
      source: row.source,
      userId: row.user_id,
      dimensions: JSON.parse(row.dimensions || '[]'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
