import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { getMimeTypeDisplayName, classifyMimeType } from '../onboarding/mime-types';
import { createSqlDriver, type SqlDriver } from './drivers';
import { runMigrations, resolveMigrationsDir } from './migration-runner';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private driver!: SqlDriver;
  private readonly logger = new Logger(DatabaseService.name);

  async onModuleInit() {
    this.driver = createSqlDriver(this.logger);
    await runMigrations(this.driver, resolveMigrationsDir(), this.logger);
    this.logger.log('Database initialized');
  }

  async onModuleDestroy() {
    await this.driver?.close();
  }

  // User operations
  async createUser(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
    provider: string;
    providerId?: string;
    passwordHash?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleTokenExpiry?: number;
  }) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      INSERT INTO users (
        id, email, name, avatar_url, provider, provider_id, password_hash,
        google_access_token, google_refresh_token, google_token_expiry,
        created_at, updated_at
      )
      VALUES (
        $id, $email, $name, $avatarUrl, $provider, $providerId, $passwordHash,
        $googleAccessToken, $googleRefreshToken, $googleTokenExpiry,
        $createdAt, $updatedAt
      )
    `,
      {
        $id: user.id,
        $email: user.email,
        $name: user.name,
        $avatarUrl: user.avatarUrl || null,
        $provider: user.provider,
        $providerId: user.providerId || null,
        $passwordHash: user.passwordHash || null,
        $googleAccessToken: user.googleAccessToken || null,
        $googleRefreshToken: user.googleRefreshToken || null,
        $googleTokenExpiry: user.googleTokenExpiry || null,
        $createdAt: now,
        $updatedAt: now,
      },
    );
  }

  async findUserById(id: string): Promise<UserRow | null> {
    return this.driver.get<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    return this.driver.get<UserRow>('SELECT * FROM users WHERE email = ?', [
      email,
    ]);
  }

  async findUserByProviderId(providerId: string): Promise<UserRow | null> {
    return this.driver.get<UserRow>(
      'SELECT * FROM users WHERE provider_id = ?',
      [providerId],
    );
  }

  async updateUser(
    id: string,
    updates: {
      name?: string;
      avatarUrl?: string;
      provider?: string;
      providerId?: string;
      googleAccessToken?: string;
      googleRefreshToken?: string;
      googleTokenExpiry?: number;
    },
  ) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      UPDATE users SET
        name = COALESCE($name, name),
        avatar_url = COALESCE($avatarUrl, avatar_url),
        provider = COALESCE($provider, provider),
        provider_id = COALESCE($providerId, provider_id),
        google_access_token = COALESCE($googleAccessToken, google_access_token),
        google_refresh_token = COALESCE($googleRefreshToken, google_refresh_token),
        google_token_expiry = COALESCE($googleTokenExpiry, google_token_expiry),
        updated_at = $updatedAt
      WHERE id = $id
    `,
      {
        $id: id,
        $name: updates.name ?? null,
        $avatarUrl: updates.avatarUrl ?? null,
        $provider: updates.provider ?? null,
        $providerId: updates.providerId ?? null,
        $googleAccessToken: updates.googleAccessToken ?? null,
        $googleRefreshToken: updates.googleRefreshToken ?? null,
        $googleTokenExpiry: updates.googleTokenExpiry ?? null,
        $updatedAt: now,
      },
    );
  }

  // Document operations
  async createDocument(doc: {
    id: string;
    title: string;
    content: string;
    url?: string;
    source: string;
    userId: string;
    tags?: string[];
    googleFileId?: string;
    googleModifiedTime?: string;
    summary?: string;
  }) {
    const now = new Date().toISOString();
    const contentAnalyzed =
      doc.content && doc.content.trim().length > 0 ? now : null;

    await this.driver.run(
      `
      INSERT INTO documents (
        id, title, content, url, source, user_id, tags,
        google_file_id, google_modified_time, summary,
        content_last_analyzed, created_at, updated_at
      )
      VALUES (
        $id, $title, $content, $url, $source, $userId, $tags,
        $googleFileId, $googleModifiedTime, $summary,
        $contentAnalyzed, $createdAt, $updatedAt
      )
    `,
      {
        $id: doc.id,
        $title: doc.title,
        $content: doc.content,
        $url: doc.url || null,
        $source: doc.source,
        $userId: doc.userId,
        $tags: doc.tags ? JSON.stringify(doc.tags) : null,
        $googleFileId: doc.googleFileId || null,
        $googleModifiedTime: doc.googleModifiedTime || null,
        $summary: doc.summary || null,
        $contentAnalyzed: contentAnalyzed,
        $createdAt: now,
        $updatedAt: now,
      },
    );
  }

  async findDocumentById(id: string): Promise<DocumentRow | null> {
    return this.driver.get<DocumentRow>(
      'SELECT * FROM documents WHERE id = ?',
      [id],
    );
  }

  async findDocumentWithCollaboratorsById(id: string): Promise<{
    document: DocumentRow | null;
    collaborators: CollaboratorRow[];
  }> {
    // Fetch document and collaborators in a single efficient query using LEFT JOIN
    const rows = await this.driver.all<
      DocumentRow & {
        collaborator_id: string | null;
        collaborator_email: string | null;
        collaborator_name: string | null;
        collaborator_avatar_url: string | null;
        collaborator_source: string | null;
        collaborator_role: string | null;
        collaborator_created_at: string | null;
        collaborator_updated_at: string | null;
      }
    >(
      `
      SELECT 
        d.*,
        c.id as collaborator_id,
        c.email as collaborator_email,
        c.name as collaborator_name,
        c.avatar_url as collaborator_avatar_url,
        c.source as collaborator_source,
        c.role as collaborator_role,
        c.created_at as collaborator_created_at,
        c.updated_at as collaborator_updated_at
      FROM documents d
      LEFT JOIN collaborators c ON d.id = c.document_id
      WHERE d.id = ?
      ORDER BY c.name ASC
    `,
      [id],
    );

    if (rows.length === 0) {
      return { document: null, collaborators: [] };
    }

    const firstRow = rows[0];
    const document: DocumentRow = {
      id: firstRow.id,
      title: firstRow.title,
      content: firstRow.content,
      url: firstRow.url,
      source: firstRow.source,
      user_id: firstRow.user_id,
      tags: firstRow.tags,
      google_file_id: firstRow.google_file_id,
      google_modified_time: firstRow.google_modified_time,
      summary: firstRow.summary,
      metadata_last_extracted: firstRow.metadata_last_extracted,
      content_last_analyzed: firstRow.content_last_analyzed,
      mime_type: firstRow.mime_type ?? null,
      mime_type_classification: firstRow.mime_type_classification ?? null,
      size_bytes: firstRow.size_bytes ?? null,
      created_at: firstRow.created_at,
      updated_at: firstRow.updated_at,
    };

    const collaborators: CollaboratorRow[] = rows
      .filter((row) => row.collaborator_id !== null)
      .map((row) => ({
        id: row.collaborator_id!,
        document_id: document.id,
        email: row.collaborator_email,
        name: row.collaborator_name!,
        avatar_url: row.collaborator_avatar_url,
        source: row.collaborator_source!,
        role: row.collaborator_role,
        created_at: row.collaborator_created_at!,
        updated_at: row.collaborator_updated_at!,
      }));

    return { document, collaborators };
  }

  async findDocumentsByUserId(userId: string): Promise<DocumentRow[]> {
    return this.driver.all<DocumentRow>(
      'SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC',
      [userId],
    );
  }

  async findDocumentByGoogleFileId(
    googleFileId: string,
  ): Promise<DocumentRow | null> {
    return this.driver.get<DocumentRow>(
      'SELECT * FROM documents WHERE google_file_id = ?',
      [googleFileId],
    );
  }

  async updateDocument(
    id: string,
    updates: {
      title?: string;
      content?: string;
      url?: string;
      source?: string;
      tags?: string[];
      googleFileId?: string;
      googleModifiedTime?: string;
      summary?: string;
    },
  ) {
    const now = new Date().toISOString();
    const contentAnalyzed =
      updates.content && updates.content.trim().length > 0 ? now : null;

    await this.driver.run(
      `
      UPDATE documents SET
        title = COALESCE($title, title),
        content = COALESCE($content, content),
        url = COALESCE($url, url),
        source = COALESCE($source, source),
        tags = COALESCE($tags, tags),
        google_file_id = COALESCE($googleFileId, google_file_id),
        google_modified_time = COALESCE($googleModifiedTime, google_modified_time),
        summary = COALESCE($summary, summary),
        content_last_analyzed = COALESCE($contentAnalyzed, content_last_analyzed),
        updated_at = $updatedAt
      WHERE id = $id
    `,
      {
        $id: id,
        $title: updates.title ?? null,
        $content: updates.content ?? null,
        $url: updates.url ?? null,
        $source: updates.source ?? null,
        $tags: updates.tags ? JSON.stringify(updates.tags) : null,
        $googleFileId: updates.googleFileId ?? null,
        $googleModifiedTime: updates.googleModifiedTime ?? null,
        $summary: updates.summary ?? null,
        $contentAnalyzed: contentAnalyzed,
        $updatedAt: now,
      },
    );
  }

  async deleteDocument(id: string) {
    await this.driver.run('DELETE FROM documents WHERE id = ?', [id]);
  }

  async deleteDocumentsByUserId(userId: string) {
    await this.driver.run('DELETE FROM documents WHERE user_id = ?', [userId]);
  }

  async clearAllDocuments() {
    await this.driver.exec('DELETE FROM documents');
  }

  // Board operations
  async createBoard(board: {
    id: string;
    userId: string;
    name?: string;
    snapshot?: string;
  }) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      INSERT INTO boards (id, user_id, name, snapshot, created_at, updated_at)
      VALUES ($id, $userId, $name, $snapshot, $createdAt, $updatedAt)
    `,
      {
        $id: board.id,
        $userId: board.userId,
        $name: board.name || 'My Board',
        $snapshot: board.snapshot || null,
        $createdAt: now,
        $updatedAt: now,
      },
    );
  }

  async findBoardById(id: string): Promise<BoardRow | null> {
    return this.driver.get<BoardRow>('SELECT * FROM boards WHERE id = ?', [id]);
  }

  async findBoardsByUserId(userId: string): Promise<BoardRow[]> {
    return this.driver.all<BoardRow>(
      'SELECT * FROM boards WHERE user_id = ? ORDER BY updated_at DESC',
      [userId],
    );
  }

  async updateBoardSnapshot(boardId: string, snapshot: string) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      UPDATE boards SET snapshot = $snapshot, updated_at = $updatedAt
      WHERE id = $boardId
    `,
      {
        $boardId: boardId,
        $snapshot: snapshot,
        $updatedAt: now,
      },
    );
  }

  async updateBoardName(boardId: string, name: string) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      UPDATE boards SET name = $name, updated_at = $updatedAt
      WHERE id = $boardId
    `,
      {
        $boardId: boardId,
        $name: name,
        $updatedAt: now,
      },
    );
  }

  async deleteBoard(id: string) {
    await this.driver.run('DELETE FROM boards WHERE id = ?', [id]);
  }

  // Document duplicate operations
  async createDocumentDuplicate(duplicate: {
    id: string;
    userId: string;
    sourceDocumentId: string;
    targetDocumentId: string;
    sourceChunkIndex?: number;
    targetChunkIndex?: number;
    similarityScore: number;
    duplicateType: 'chunk' | 'document';
  }) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      INSERT INTO document_duplicates (
        id, user_id, source_document_id, target_document_id,
        source_chunk_index, target_chunk_index, similarity_score,
        duplicate_type, created_at, updated_at
      )
      VALUES (
        $id, $userId, $sourceDocumentId, $targetDocumentId,
        $sourceChunkIndex, $targetChunkIndex, $similarityScore,
        $duplicateType, $createdAt, $updatedAt
      )
    `,
      {
        $id: duplicate.id,
        $userId: duplicate.userId,
        $sourceDocumentId: duplicate.sourceDocumentId,
        $targetDocumentId: duplicate.targetDocumentId,
        $sourceChunkIndex: duplicate.sourceChunkIndex ?? null,
        $targetChunkIndex: duplicate.targetChunkIndex ?? null,
        $similarityScore: duplicate.similarityScore,
        $duplicateType: duplicate.duplicateType,
        $createdAt: now,
        $updatedAt: now,
      },
    );
  }

  async findDuplicatesByDocumentId(
    documentId: string,
  ): Promise<DuplicateRow[]> {
    return this.driver.all<DuplicateRow>(
      `
      SELECT * FROM document_duplicates
      WHERE source_document_id = ? OR target_document_id = ?
      ORDER BY similarity_score DESC
    `,
      [documentId, documentId],
    );
  }

  async findDuplicatesByUserId(userId: string): Promise<DuplicateRow[]> {
    return this.driver.all<DuplicateRow>(
      `
      SELECT * FROM document_duplicates
      WHERE user_id = ?
      ORDER BY similarity_score DESC
    `,
      [userId],
    );
  }

  async findDuplicateById(id: string): Promise<DuplicateRow | null> {
    return this.driver.get<DuplicateRow>(
      'SELECT * FROM document_duplicates WHERE id = ?',
      [id],
    );
  }

  async deleteDuplicatesByDocumentId(documentId: string) {
    await this.driver.run(
      `
      DELETE FROM document_duplicates
      WHERE source_document_id = ? OR target_document_id = ?
    `,
      [documentId, documentId],
    );
  }

  async deleteDuplicatesByUserId(userId: string) {
    await this.driver.run(
      'DELETE FROM document_duplicates WHERE user_id = ?',
      [userId],
    );
  }

  async clearAllDuplicates() {
    await this.driver.exec('DELETE FROM document_duplicates');
  }

  // Collaborator operations
  async createCollaborator(collaborator: {
    id: string;
    documentId: string;
    email?: string;
    name: string;
    avatarUrl?: string;
    source: string;
    role?: string;
  }) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      INSERT INTO collaborators (
        id, document_id, email, name, avatar_url, source, role,
        created_at, updated_at
      )
      VALUES (
        $id, $documentId, $email, $name, $avatarUrl, $source, $role,
        $createdAt, $updatedAt
      )
    `,
      {
        $id: collaborator.id,
        $documentId: collaborator.documentId,
        $email: collaborator.email || null,
        $name: collaborator.name,
        $avatarUrl: collaborator.avatarUrl || null,
        $source: collaborator.source,
        $role: collaborator.role || null,
        $createdAt: now,
        $updatedAt: now,
      },
    );
  }

  async findCollaboratorsByDocumentId(
    documentId: string,
  ): Promise<CollaboratorRow[]> {
    return this.driver.all<CollaboratorRow>(
      'SELECT * FROM collaborators WHERE document_id = ? ORDER BY name ASC',
      [documentId],
    );
  }

  async deleteCollaboratorsByDocumentId(documentId: string) {
    await this.driver.run(
      'DELETE FROM collaborators WHERE document_id = ?',
      [documentId],
    );
  }

  async upsertCollaboratorsForDocument(
    documentId: string,
    collaborators: Array<{
      email?: string;
      name: string;
      avatarUrl?: string;
      source: string;
      role?: string;
    }>,
  ) {
    await this.deleteCollaboratorsByDocumentId(documentId);

    for (const collaborator of collaborators) {
      const id = `collab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await this.createCollaborator({
        id,
        documentId,
        email: collaborator.email,
        name: collaborator.name,
        avatarUrl: collaborator.avatarUrl,
        source: collaborator.source,
        role: collaborator.role,
      });
    }
  }

  // Onboarding operations
  async createOnboarding(onboarding: {
    id: string;
    userId: string;
    driveConnectedAt?: string;
  }) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      INSERT INTO onboarding (id, user_id, drive_connected_at, created_at, updated_at)
      VALUES ($id, $userId, $driveConnectedAt, $createdAt, $updatedAt)
    `,
      {
        $id: onboarding.id,
        $userId: onboarding.userId,
        $driveConnectedAt: onboarding.driveConnectedAt || now,
        $createdAt: now,
        $updatedAt: now,
      },
    );
  }

  async findOnboardingByUserId(userId: string): Promise<OnboardingRow | null> {
    return this.driver.get<OnboardingRow>(
      'SELECT * FROM onboarding WHERE user_id = ?',
      [userId],
    );
  }

  async findOnboardingById(id: string): Promise<OnboardingRow | null> {
    return this.driver.get<OnboardingRow>(
      'SELECT * FROM onboarding WHERE id = ?',
      [id],
    );
  }

  async getAllOnboarding(): Promise<OnboardingRow[]> {
    return this.driver.all<OnboardingRow>('SELECT * FROM onboarding');
  }

  async updateOnboarding(
    userId: string,
    updates: {
      driveConnectedAt?: string;
      metadataScanStartedAt?: string;
      metadataScanCompletedAt?: string;
      totalFileCount?: number;
      totalSizeBytes?: number;
      folderCount?: number;
      supportedFileCount?: number;
      supportedSizeBytes?: number;
      unsupportedFileCount?: number;
      sharedDocCount?: number;
      uniqueCollaboratorCount?: number;
      reviewCompletedAt?: string;
      processingConfirmedAt?: string;
      processingOptions?: {
        prioritizeShared?: boolean;
        prioritizeRecent?: boolean;
        skipDrafts?: boolean;
      };
      processingStartedAt?: string;
      processingCompletedAt?: string;
      filesProcessed?: number;
      filesTotal?: number;
      estimatedCostUsd?: number;
      actualCostUsd?: number;
    },
  ) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      UPDATE onboarding SET
        drive_connected_at = COALESCE($driveConnectedAt, drive_connected_at),
        metadata_scan_started_at = COALESCE($metadataScanStartedAt, metadata_scan_started_at),
        metadata_scan_completed_at = COALESCE($metadataScanCompletedAt, metadata_scan_completed_at),
        total_file_count = COALESCE($totalFileCount, total_file_count),
        total_size_bytes = COALESCE($totalSizeBytes, total_size_bytes),
        folder_count = COALESCE($folderCount, folder_count),
        supported_file_count = COALESCE($supportedFileCount, supported_file_count),
        supported_size_bytes = COALESCE($supportedSizeBytes, supported_size_bytes),
        unsupported_file_count = COALESCE($unsupportedFileCount, unsupported_file_count),
        shared_doc_count = COALESCE($sharedDocCount, shared_doc_count),
        unique_collaborator_count = COALESCE($uniqueCollaboratorCount, unique_collaborator_count),
        review_completed_at = COALESCE($reviewCompletedAt, review_completed_at),
        processing_confirmed_at = COALESCE($processingConfirmedAt, processing_confirmed_at),
        processing_options = COALESCE($processingOptions, processing_options),
        processing_started_at = COALESCE($processingStartedAt, processing_started_at),
        processing_completed_at = COALESCE($processingCompletedAt, processing_completed_at),
        files_processed = COALESCE($filesProcessed, files_processed),
        files_total = COALESCE($filesTotal, files_total),
        estimated_cost_usd = COALESCE($estimatedCostUsd, estimated_cost_usd),
        actual_cost_usd = COALESCE($actualCostUsd, actual_cost_usd),
        updated_at = $updatedAt
      WHERE user_id = $userId
    `,
      {
        $userId: userId,
        $driveConnectedAt: updates.driveConnectedAt ?? null,
        $metadataScanStartedAt: updates.metadataScanStartedAt ?? null,
        $metadataScanCompletedAt: updates.metadataScanCompletedAt ?? null,
        $totalFileCount: updates.totalFileCount ?? null,
        $totalSizeBytes: updates.totalSizeBytes ?? null,
        $folderCount: updates.folderCount ?? null,
        $supportedFileCount: updates.supportedFileCount ?? null,
        $supportedSizeBytes: updates.supportedSizeBytes ?? null,
        $unsupportedFileCount: updates.unsupportedFileCount ?? null,
        $sharedDocCount: updates.sharedDocCount ?? null,
        $uniqueCollaboratorCount: updates.uniqueCollaboratorCount ?? null,
        $reviewCompletedAt: updates.reviewCompletedAt ?? null,
        $processingConfirmedAt: updates.processingConfirmedAt ?? null,
        $processingOptions: updates.processingOptions
          ? JSON.stringify(updates.processingOptions)
          : null,
        $processingStartedAt: updates.processingStartedAt ?? null,
        $processingCompletedAt: updates.processingCompletedAt ?? null,
        $filesProcessed: updates.filesProcessed ?? null,
        $filesTotal: updates.filesTotal ?? null,
        $estimatedCostUsd: updates.estimatedCostUsd ?? null,
        $actualCostUsd: updates.actualCostUsd ?? null,
        $updatedAt: now,
      },
    );
  }

  async incrementFilesProcessed(userId: string) {
    const now = new Date().toISOString();
    const SMALL_BATCH_THRESHOLD = 10;
    const COMPLETION_PROXIMITY_THRESHOLD = 5;
    const COMPLETION_PERCENT_THRESHOLD = 0.9;
    const AUTO_COMPLETE_PERCENT_THRESHOLD = 0.99;

    await this.driver.run(
      `
      UPDATE onboarding SET
        files_processed = COALESCE(files_processed, 0) + 1,
        processing_completed_at = CASE
          WHEN processing_completed_at IS NULL 
            AND files_total IS NOT NULL
            AND (
              files_total <= ${SMALL_BATCH_THRESHOLD}
              OR COALESCE(files_processed, 0) + 1 >= files_total - ${COMPLETION_PROXIMITY_THRESHOLD}
              OR (COALESCE(files_processed, 0) + 1.0) / NULLIF(files_total, 0) >= ${COMPLETION_PERCENT_THRESHOLD}
            )
            AND (
              COALESCE(files_processed, 0) + 1 >= files_total
              OR (COALESCE(files_processed, 0) + 1.0) / NULLIF(files_total, 0) >= ${AUTO_COMPLETE_PERCENT_THRESHOLD}
            )
          THEN $now
          ELSE processing_completed_at
        END,
        updated_at = $updatedAt
      WHERE user_id = $userId
    `,
      { $userId: userId, $updatedAt: now, $now: now },
    );
  }

  async deleteOnboardingByUserId(userId: string) {
    await this.driver.run('DELETE FROM onboarding WHERE user_id = ?', [userId]);
  }

  // Document metadata operations (for incremental scan progress)
  async upsertDocumentMetadata(file: {
    userId: string;
    googleFileId: string;
    name: string;
    mimeType: string;
    classification?: 'supported' | 'future' | 'ignored';
    sizeBytes?: number;
    modifiedTime?: string;
    shared?: boolean;
    url?: string;
  }) {
    const existing = await this.findDocumentByGoogleFileId(file.googleFileId);
    const now = new Date().toISOString();

    if (existing) {
      await this.updateDocumentMetadata(file, now);
      return;
    }

    await this.createDocumentMetadata(file, now);
  }

  private async updateDocumentMetadata(
    file: {
      googleFileId: string;
      name: string;
      mimeType: string;
      classification?: 'supported' | 'future' | 'ignored';
      sizeBytes?: number;
      modifiedTime?: string;
      url?: string;
    },
    timestamp: string,
  ) {
    await this.driver.run(
      `
      UPDATE documents SET
        title = $title,
        url = COALESCE($url, url),
        mime_type = COALESCE($mimeType, mime_type),
        mime_type_classification = COALESCE($classification, mime_type_classification),
        size_bytes = COALESCE($sizeBytes, size_bytes),
        google_modified_time = $modifiedTime,
        metadata_last_extracted = $timestamp,
        updated_at = $updatedAt
      WHERE google_file_id = $googleFileId
    `,
      {
        $title: file.name,
        $url: file.url || null,
        $mimeType: file.mimeType || null,
        $classification: file.classification || null,
        $sizeBytes: file.sizeBytes ?? null,
        $modifiedTime: file.modifiedTime || null,
        $timestamp: timestamp,
        $updatedAt: timestamp,
        $googleFileId: file.googleFileId,
      },
    );
  }

  private async createDocumentMetadata(
    file: {
      userId: string;
      googleFileId: string;
      name: string;
      mimeType: string;
      classification?: 'supported' | 'future' | 'ignored';
      sizeBytes?: number;
      modifiedTime?: string;
      url?: string;
    },
    timestamp: string,
  ) {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await this.driver.run(
      `
      INSERT INTO documents (
        id, title, content, url, source, user_id, google_file_id, google_modified_time,
        mime_type, mime_type_classification, size_bytes, metadata_last_extracted, created_at, updated_at
      )
      VALUES ($id, $title, $content, $url, $source, $userId, $googleFileId, $modifiedTime, $mimeType, $classification, $sizeBytes, $timestamp, $createdAt, $updatedAt)
    `,
      {
        $id: id,
        $title: file.name,
        $content: '',
        $url: file.url || null,
        $source: 'google-drive',
        $userId: file.userId,
        $googleFileId: file.googleFileId,
        $modifiedTime: file.modifiedTime || null,
        $mimeType: file.mimeType || null,
        $classification: file.classification || null,
        $sizeBytes: file.sizeBytes ?? null,
        $timestamp: timestamp,
        $createdAt: timestamp,
        $updatedAt: timestamp,
      },
    );
  }

  async countDocumentsWithMetadata(userId: string): Promise<number> {
    const result = await this.driver.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND metadata_last_extracted IS NOT NULL',
      [userId],
    );
    return result?.count ?? 0;
  }

  /**
   * Compute file type breakdown from documents table for a user.
   * Aggregates counts in SQL for efficiency, then merges by display name so
   * different image formats (image/jpeg, image/png, etc.) merge into "Image".
   */
  async computeFileTypeBreakdown(
    userId: string,
  ): Promise<
    Record<
      string,
      {
        count: number;
        sizeBytes: number;
        displayName: string;
        classification: 'supported' | 'future' | 'ignored';
      }
    >
  > {
    const mimeTypeCounts = await this.aggregateMimeTypeCounts(userId);
    const breakdownMap = this.buildBreakdownMap(mimeTypeCounts);
    return this.mapToRecord(breakdownMap);
  }

  private async aggregateMimeTypeCounts(userId: string) {
    return this.driver.all<{
      mime_type: string;
      mime_type_classification: string | null;
      count: number;
      total_size_bytes: number;
    }>(
      `
        SELECT 
          mime_type,
          mime_type_classification,
          COUNT(*) as count,
          COALESCE(SUM(size_bytes), 0) as total_size_bytes
        FROM documents
        WHERE user_id = ? AND metadata_last_extracted IS NOT NULL AND mime_type IS NOT NULL
        GROUP BY mime_type, mime_type_classification
      `,
      [userId],
    );
  }

  private buildBreakdownMap(
    mimeTypeCounts: Array<{
      mime_type: string;
      mime_type_classification: string | null;
      count: number;
      total_size_bytes: number;
    }>,
  ): Map<
    string,
    {
      count: number;
      sizeBytes: number;
      displayName: string;
      classification: 'supported' | 'future' | 'ignored';
    }
  > {
    const breakdownMap = new Map<
      string,
      {
        count: number;
        sizeBytes: number;
        displayName: string;
        classification: 'supported' | 'future' | 'ignored';
      }
    >();

    for (const row of mimeTypeCounts) {
      const classification = (row.mime_type_classification ||
        classifyMimeType(row.mime_type)) as 'supported' | 'future' | 'ignored';
      const displayName = getMimeTypeDisplayName(row.mime_type);
      const key = `${displayName}|${classification}`;

      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          count: 0,
          sizeBytes: 0,
          displayName,
          classification,
        });
      }

      const entry = breakdownMap.get(key)!;
      entry.count += row.count;
      entry.sizeBytes += row.total_size_bytes;
    }

    return breakdownMap;
  }

  private mapToRecord(
    breakdownMap: Map<
      string,
      {
        count: number;
        sizeBytes: number;
        displayName: string;
        classification: 'supported' | 'future' | 'ignored';
      }
    >,
  ): Record<
    string,
    {
      count: number;
      sizeBytes: number;
      displayName: string;
      classification: 'supported' | 'future' | 'ignored';
    }
  > {
    const breakdown: Record<
      string,
      {
        count: number;
        sizeBytes: number;
        displayName: string;
        classification: 'supported' | 'future' | 'ignored';
      }
    > = {};
    for (const [key, value] of breakdownMap.entries()) {
      breakdown[key] = value;
    }
    return breakdown;
  }

  async deleteDocumentsMetadataByUserId(userId: string) {
    // Delete only documents that have metadata but no content analyzed
    await this.driver.run(
      'DELETE FROM documents WHERE user_id = ? AND metadata_last_extracted IS NOT NULL AND (content_last_analyzed IS NULL OR content_last_analyzed = "")',
      [userId],
    );
  }

  async incrementMetadataFilesScanned(userId: string) {
    const now = new Date().toISOString();
    await this.driver.run(
      `
      UPDATE onboarding SET
        metadata_files_scanned = COALESCE(metadata_files_scanned, 0) + 1,
        updated_at = $updatedAt
      WHERE user_id = $userId
    `,
      { $userId: userId, $updatedAt: now },
    );
  }

  // Avatar cache operations (blob storage)
  async getAvatarCache(
    hash: string,
  ): Promise<{ data: Uint8Array; content_type: string } | null> {
    return this.driver.get<{ data: Uint8Array; content_type: string }>(
      'SELECT data, content_type FROM avatar_cache WHERE hash = ?',
      [hash],
    );
  }

  async setAvatarCache(
    hash: string,
    data: Uint8Array,
    contentType: string,
    originalUrl?: string,
  ) {
    await this.driver.run(
      `INSERT OR REPLACE INTO avatar_cache (hash, content_type, data, original_url, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [hash, contentType, data, originalUrl || '', new Date().toISOString()],
    );
  }

  async avatarCacheExists(hash: string): Promise<boolean> {
    const result = await this.driver.get(
      'SELECT 1 AS one FROM avatar_cache WHERE hash = ? LIMIT 1',
      [hash],
    );
    return !!result;
  }

  async deleteAvatarCache(hash: string) {
    await this.driver.run('DELETE FROM avatar_cache WHERE hash = ?', [hash]);
  }
}

// Row types for SQL results
export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  provider: string;
  provider_id: string | null;
  password_hash: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: number | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  content: string;
  url: string | null;
  source: string;
  user_id: string;
  tags: string | null;
  google_file_id: string | null;
  google_modified_time: string | null;
  summary: string | null;
  metadata_last_extracted: string | null;
  content_last_analyzed: string | null;
  mime_type: string | null;
  mime_type_classification: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface BoardRow {
  id: string;
  user_id: string;
  name: string;
  snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuplicateRow {
  id: string;
  user_id: string;
  source_document_id: string;
  target_document_id: string;
  source_chunk_index: number | null;
  target_chunk_index: number | null;
  similarity_score: number;
  duplicate_type: string;
  created_at: string;
  updated_at: string;
}

export interface CollaboratorRow {
  id: string;
  document_id: string;
  email: string | null;
  name: string;
  avatar_url: string | null;
  source: string;
  role: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingRow {
  id: string;
  user_id: string;
  drive_connected_at: string | null;
  metadata_scan_started_at: string | null;
  metadata_scan_completed_at: string | null;
  metadata_files_scanned: number | null;
  total_file_count: number | null;
  total_size_bytes: number | null;
  folder_count: number | null;
  supported_file_count: number | null;
  supported_size_bytes: number | null;
  unsupported_file_count: number | null;
  shared_doc_count: number | null;
  unique_collaborator_count: number | null;
  review_completed_at: string | null;
  processing_confirmed_at: string | null;
  processing_options: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  files_processed: number | null;
  files_total: number | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  created_at: string;
  updated_at: string;
}

export interface DriveMetadataFileRow {
  id: string;
  user_id: string;
  google_file_id: string;
  name: string;
  mime_type: string;
  size_bytes: number | null;
  modified_time: string | null;
  shared: number;
  created_at: string;
}
