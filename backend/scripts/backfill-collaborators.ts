#!/usr/bin/env bun
/**
 * Backfill script for collaborator data on existing documents
 * 
 * Usage: bun run scripts/backfill-collaborators.ts [userId]
 * 
 * This script fetches permissions and revisions from Google Drive API
 * for existing documents and stores the extracted collaborators in the database.
 */

// @ts-expect-error - bun:sqlite is a Bun-specific module
import { Database } from 'bun:sqlite';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../src/database/database.service';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_PATH = './data/berkdoc.db';

interface DocumentRow {
  id: string;
  title: string;
  google_file_id: string | null;
  user_id: string;
  source: string;
}

/**
 * Backfill collaborators for existing documents
 */
async function backfillCollaborators(userId?: string) {
  console.log('=== Collaborator Backfill Script ===\n');
  console.log('Connecting to database...');

  const db = new Database(DB_PATH);

  try {
    // Get documents with google_file_id
    let documents: DocumentRow[];
    if (userId) {
      documents = db
        .query(
          `SELECT id, title, google_file_id, user_id, source 
           FROM documents 
           WHERE user_id = ? AND google_file_id IS NOT NULL 
           ORDER BY updated_at DESC`,
        )
        .all(userId) as DocumentRow[];
      console.log(`Found ${documents.length} documents with google_file_id for user ${userId}`);
    } else {
      documents = db
        .query(
          `SELECT id, title, google_file_id, user_id, source 
           FROM documents 
           WHERE google_file_id IS NOT NULL 
           ORDER BY updated_at DESC`,
        )
        .all() as DocumentRow[];
      console.log(`Found ${documents.length} documents with google_file_id total`);
    }

    if (documents.length === 0) {
      console.log('No documents with google_file_id found.');
      return;
    }

    // Initialize services
    const configService = new ConfigService();
    const databaseService = new DatabaseService();
    await databaseService.onModuleInit();
    const googleDriveService = new GoogleDriveService(
      configService,
      databaseService,
    );

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let totalCollaborators = 0;

    console.log('\nStarting backfill process...\n');

    // Group documents by user_id to process efficiently
    const documentsByUser = new Map<string, DocumentRow[]>();
    for (const doc of documents) {
      if (!documentsByUser.has(doc.user_id)) {
        documentsByUser.set(doc.user_id, []);
      }
      documentsByUser.get(doc.user_id)!.push(doc);
    }

    for (const [currentUserId, userDocs] of documentsByUser) {
      console.log(`\nProcessing ${userDocs.length} documents for user ${currentUserId}...`);

      for (const doc of userDocs) {
        try {
          console.log(`\n[${processed + skipped + errors + 1}/${documents.length}] Processing: ${doc.title}`);

          // Check if document already has collaborators
          const existingCollaborators = databaseService.findCollaboratorsByDocumentId(doc.id);
          if (existingCollaborators.length > 0) {
            console.log(`  Skipping: Already has ${existingCollaborators.length} collaborator(s)`);
            skipped++;
            continue;
          }

          // Get file metadata to determine mimeType
          const drive = await googleDriveService.getDriveClient(currentUserId);
          const fileInfo = await drive.files.get({
            fileId: doc.google_file_id!,
            fields: 'mimeType',
          });
          const mimeType = fileInfo.data.mimeType || 'application/vnd.google-apps.document';

          // Fetch permissions and revisions (same as downloadAndExtractText does)
          const fileResponse = await drive.files.get({
            fileId: doc.google_file_id!,
            fields: 'permissions(id,emailAddress,displayName,type,role,photoLink)',
          });

          const permissions =
            (fileResponse.data.permissions as Array<{
              id?: string;
              emailAddress?: string;
              displayName?: string;
              type?: string;
              role?: string;
              photoLink?: string;
            }>) || [];

          // Fetch revisions separately
          let revisions: Array<{
            id?: string;
            lastModifyingUser?: {
              emailAddress?: string;
              displayName?: string;
              photoLink?: string;
            };
          }> = [];
          try {
            const revisionsResponse = await drive.revisions.list({
              fileId: doc.google_file_id!,
              fields: 'revisions(id,lastModifyingUser)',
            });
            revisions = (revisionsResponse.data.revisions as typeof revisions) || [];
          } catch (error) {
            // Some files may not have revisions accessible
            console.log(`  Warning: Could not fetch revisions: ${error instanceof Error ? error.message : String(error)}`);
          }

          console.log(`  Permissions: ${permissions.length}, Revisions: ${revisions.length}`);

          // Get user's email to exclude author from collaborator list
          const user = databaseService.findUserById(currentUserId);
          const authorEmail = user?.email;

          // Extract collaborators (exclude author)
          const collaborators = googleDriveService.extractCollaborators(
            permissions,
            revisions,
            authorEmail,
          );

          if (collaborators.length === 0) {
            console.log(`  No collaborators found`);
            skipped++;
            continue;
          }

          // Store collaborators
          databaseService.upsertCollaboratorsForDocument(doc.id, collaborators);
          totalCollaborators += collaborators.length;

          console.log(`  ✓ Stored ${collaborators.length} collaborator(s)`);
          processed++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(`  ✗ ERROR: ${errorMessage}`);
          errors++;
        }
      }
    }

    // Print summary
    console.log('\n\n=== Backfill Summary ===');
    console.log(`Total documents processed: ${processed}`);
    console.log(`Documents skipped (already had collaborators or none found): ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total collaborators stored: ${totalCollaborators}`);
    console.log(`Average collaborators per document: ${processed > 0 ? (totalCollaborators / processed).toFixed(2) : 0}`);
  } catch (error) {
    console.error('Script failed:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const userId = args[0]; // Optional userId argument

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  bun run scripts/backfill-collaborators.ts [userId]

Description:
  Backfills collaborator data for existing documents by fetching permissions
  and revisions from Google Drive API and storing extracted collaborators.

Arguments:
  userId (optional)  - If provided, only backfill collaborators for this user's documents.
                      If omitted, backfill collaborators for all documents with google_file_id.

Options:
  --help, -h         Show this help message

Examples:
  bun run scripts/backfill-collaborators.ts
  bun run scripts/backfill-collaborators.ts user123

Notes:
  - Skips documents that already have collaborators
  - Requires valid Google OAuth tokens for each user
  - May take some time depending on the number of documents
    `);
    return;
  }

  try {
    await backfillCollaborators(userId);
  } catch (error) {
    console.error('Script failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
