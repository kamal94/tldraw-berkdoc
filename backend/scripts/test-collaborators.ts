#!/usr/bin/env bun
/**
 * Test script for collaborator extraction from Google Drive documents
 * 
 * Usage: bun run scripts/test-collaborators.ts <userId> [limit]
 * 
 * This script tests the collaborator extraction functionality on a subset
 * of documents that have google_file_id set. It fetches permissions and
 * revisions from Google Drive API and shows the extracted collaborators.
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

interface TestResult {
  documentId: string;
  title: string;
  googleFileId: string;
  success: boolean;
  error?: string;
  permissionsCount: number;
  revisionsCount: number;
  collaboratorsCount: number;
  collaborators: Array<{
    email?: string;
    name: string;
    source: string;
    role?: string;
  }>;
}

/**
 * Test collaborator extraction on a subset of documents
 */
async function testCollaborators(userId: string, limit: number = 5) {
  console.log('=== Collaborator Extraction Test ===\n');
  console.log(`User ID: ${userId}`);
  console.log(`Limit: ${limit}\n`);

  const db = new Database(DB_PATH);

  try {
    // Get documents with google_file_id for this user
    const documents = db
      .query(
        `SELECT id, title, google_file_id, user_id, source 
         FROM documents 
         WHERE user_id = ? AND google_file_id IS NOT NULL 
         LIMIT ?`,
      )
      .all(userId, limit) as DocumentRow[];

    if (documents.length === 0) {
      console.log('No documents with google_file_id found for this user.');
      console.log('Make sure the user has synced Google Drive documents.');
      return;
    }

    console.log(`Found ${documents.length} document(s) to test.\n`);

    // Initialize services
    const configService = new ConfigService();
    const databaseService = new DatabaseService();
    await databaseService.onModuleInit();
    const googleDriveService = new GoogleDriveService(
      configService,
      databaseService,
    );

    const results: TestResult[] = [];

    for (const doc of documents) {
      console.log(`\n--- Testing: ${doc.title} ---`);
      console.log(`Document ID: ${doc.id}`);
      console.log(`Google File ID: ${doc.google_file_id}`);

      try {
        // Fetch file metadata with permissions and revisions
        // We use downloadAndExtractText but only use the metadata part
        // (we could optimize this to skip content extraction, but this works for testing)
        const drive = await googleDriveService.getDriveClient(userId);
        
        // First get mimeType
        const fileInfo = await drive.files.get({
          fileId: doc.google_file_id!,
          fields: 'mimeType',
        });
        const mimeType = fileInfo.data.mimeType || 'application/vnd.google-apps.document';
        
        // Fetch permissions from files.get
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

        // Fetch revisions separately using revisions.list
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
          console.log(`  Warning: Could not fetch revisions: ${error instanceof Error ? error.message : String(error)}`);
        }

        console.log(`  MIME Type: ${mimeType}`);
        console.log(`  Permissions found: ${permissions.length}`);
        console.log(`  Revisions found: ${revisions.length}`);

        // Get user's email to exclude author from collaborator list
        const user = databaseService.findUserById(userId);
        const authorEmail = user?.email;

        // Extract collaborators (exclude author)
        const collaborators = googleDriveService.extractCollaborators(
          permissions,
          revisions,
          authorEmail,
        );

        console.log(`  Collaborators extracted: ${collaborators.length}`);

        if (collaborators.length > 0) {
          console.log('\n  Collaborators:');
          collaborators.forEach((collab, index) => {
            console.log(`    ${index + 1}. ${collab.name}`);
            if (collab.email) {
              console.log(`       Email: ${collab.email}`);
            }
            console.log(`       Source: ${collab.source}`);
            if (collab.role) {
              console.log(`       Role: ${collab.role}`);
            }
            if (collab.avatarUrl) {
              console.log(`       Avatar: ${collab.avatarUrl}`);
            }
          });
        }

        results.push({
          documentId: doc.id,
          title: doc.title,
          googleFileId: doc.google_file_id!,
          success: true,
          permissionsCount: permissions.length,
          revisionsCount: revisions.length,
          collaboratorsCount: collaborators.length,
          collaborators: collaborators.map((c) => ({
            email: c.email,
            name: c.name,
            source: c.source,
            role: c.role,
          })),
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`  ERROR: ${errorMessage}`);

        results.push({
          documentId: doc.id,
          title: doc.title,
          googleFileId: doc.google_file_id!,
          success: false,
          error: errorMessage,
          permissionsCount: 0,
          revisionsCount: 0,
          collaboratorsCount: 0,
          collaborators: [],
        });
      }
    }

    // Print summary
    console.log('\n\n=== Summary ===');
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalCollaborators = results.reduce(
      (sum, r) => sum + r.collaboratorsCount,
      0,
    );
    const totalPermissions = results.reduce(
      (sum, r) => sum + r.permissionsCount,
      0,
    );
    const totalRevisions = results.reduce(
      (sum, r) => sum + r.revisionsCount,
      0,
    );

    console.log(`Total documents tested: ${results.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total permissions found: ${totalPermissions}`);
    console.log(`Total revisions found: ${totalRevisions}`);
    console.log(`Total collaborators extracted: ${totalCollaborators}`);

    if (failed > 0) {
      console.log('\nFailed documents:');
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.title}: ${r.error}`);
        });
    }

    // Show collaborator breakdown by source
    const bySource = {
      permissions: 0,
      revisions: 0,
      both: 0,
    };
    results.forEach((r) => {
      r.collaborators.forEach((c) => {
        if (c.source === 'permissions') bySource.permissions++;
        else if (c.source === 'revisions') bySource.revisions++;
        else if (c.source === 'both') bySource.both++;
      });
    });

    if (totalCollaborators > 0) {
      console.log('\nCollaborators by source:');
      console.log(`  From permissions only: ${bySource.permissions}`);
      console.log(`  From revisions only: ${bySource.revisions}`);
      console.log(`  From both: ${bySource.both}`);
    }
  } catch (error) {
    console.error('Script failed:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    db.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
Usage:
  bun run scripts/test-collaborators.ts <userId> [limit]

Description:
  Tests collaborator extraction on a subset of Google Drive documents.
  Fetches permissions and revisions from Google Drive API and shows
  the extracted collaborators.

Arguments:
  userId (required)  - The user ID to test collaborator extraction for
  limit (optional)   - Maximum number of documents to test (default: 5)

Examples:
  bun run scripts/test-collaborators.ts user123
  bun run scripts/test-collaborators.ts user123 10
    `);
    return;
  }

  const userId = args[0];
  const limit = args[1] ? parseInt(args[1], 10) : 100;

  if (!userId) {
    console.error('Error: userId is required');
    process.exit(1);
  }

  if (isNaN(limit) || limit < 1) {
    console.error('Error: limit must be a positive number');
    process.exit(1);
  }

  try {
    await testCollaborators(userId, limit);
  } catch (error) {
    console.error('Script failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
