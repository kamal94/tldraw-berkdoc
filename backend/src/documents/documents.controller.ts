import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto, SearchDocumentsDto } from './dto/document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type CurrentUserData } from '../auth/decorators/current-user.decorator';
import { EmbeddingService } from '../embedding/embedding.service';
import { WeaviateService } from '../weaviate/weaviate.service';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private embeddingService: EmbeddingService,
    private weaviateService: WeaviateService,
  ) {}

  @Post()
  async create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateDocumentDto) {
    return this.documentsService.create(user.id, dto);
  }

  @Get()
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.documentsService.findAll(user.id);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.documentsService.findOne(user.id, id);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(user.id, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    await this.documentsService.remove(user.id, id);
    return { success: true };
  }

  @Post('search')
  async search(@CurrentUser() user: CurrentUserData, @Body() dto: SearchDocumentsDto) {
    // Generate embedding for the query
    const queryVector = await this.embeddingService.embed(dto.query);

    // Search in Weaviate
    const results = await this.weaviateService.searchSimilar(queryVector, user.id, dto.limit || 10);

    // Group results by document and return unique documents with relevance
    const documentScores = new Map<string, { score: number; title: string; source: string }>();

    for (const result of results) {
      const existing = documentScores.get(result.documentId);
      if (!existing || result.score > existing.score) {
        documentScores.set(result.documentId, {
          score: result.score,
          title: result.title,
          source: result.source,
        });
      }
    }

    return Array.from(documentScores.entries())
      .map(([documentId, data]) => ({
        documentId,
        ...data,
      }))
      .sort((a, b) => b.score - a.score);
  }
}

