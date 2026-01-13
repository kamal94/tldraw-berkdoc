import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { DatabaseService } from '../database/database.service';
import { PDFParse } from 'pdf-parse';
import type { CollaboratorData } from './types/collaborator.types';

export interface FileProcessingResult {
  content: string;
  permissions: Array<{
    id?: string;
    emailAddress?: string;
    displayName?: string;
    type?: string;
    role?: string;
    photoLink?: string;
  }>;
  revisions: Array<{
    id?: string;
    lastModifyingUser?: {
      emailAddress?: string;
      displayName?: string;
      photoLink?: string;
    };
  }>;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) { }

  async getDriveClient(userId: string) {
    const user = this.databaseService.findUserById(userId);
    if (!user || !user.google_access_token) {
      throw new UnauthorizedException('User has no Google account linked or tokens missing');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: rowToNullable(user.google_refresh_token),
      expiry_date: rowToNullable(user.google_token_expiry),
    });

    // Handle token refresh
    oauth2Client.on('tokens', (tokens) => {
      this.logger.log(`Refreshing tokens for user ${userId}`);
      this.databaseService.updateUser(userId, {
        googleAccessToken: tokens.access_token || undefined,
        googleRefreshToken: tokens.refresh_token || undefined,
        googleTokenExpiry: tokens.expiry_date || undefined,
      });
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  async listFilesPage(userId: string, pageToken?: string) {
    const drive = await this.getDriveClient(userId);

    // Query for PDFs and Google Docs only (exclude sheets, slides, etc.)
    const q = "(mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.document') and trashed = false";

    const response = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)',
      pageSize: 100,
      pageToken,
    }) as { data: { files?: Array<{ id?: string; name?: string; mimeType?: string; modifiedTime?: string; webViewLink?: string }>; nextPageToken?: string } };

    return {
      files: response.data.files || [],
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  async downloadAndExtractText(
    userId: string,
    fileId: string,
    mimeType: string,
  ): Promise<FileProcessingResult> {
    const drive = await this.getDriveClient(userId);

    // Fetch permissions from files.get
    const fileResponse = await drive.files.get({
      fileId,
      fields: 'permissions(id,emailAddress,displayName,type,role,photoLink)',
    });

    const permissions =
      (fileResponse.data.permissions as FileProcessingResult['permissions']) ||
      [];

    // Fetch revisions separately using revisions.list
    let revisions: FileProcessingResult['revisions'] = [];
    try {
      const revisionsResponse = await drive.revisions.list({
        fileId,
        fields: 'revisions(id,lastModifyingUser)',
      });
      revisions =
        (revisionsResponse.data.revisions as FileProcessingResult['revisions']) ||
        [];
    } catch (error) {
      // Some files may not have revisions accessible, log and continue
      this.logger.warn(
        `Could not fetch revisions for file ${fileId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Then extract content based on mimeType
    let content: string;

    if (mimeType === 'application/vnd.google-apps.document') {
      // Export Google Doc as plain text
      const exportResponse = await drive.files.export({
        fileId,
        mimeType: 'text/plain',
      });
      content = exportResponse.data as string;
    } else if (mimeType === 'application/pdf') {
      // Download PDF as binary
      const mediaResponse = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );

      const buffer = Buffer.from(mediaResponse.data as ArrayBuffer);
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        content = result.text;
      } finally {
        await parser.destroy();
      }
    } else {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }

    return {
      content,
      permissions,
      revisions,
    };
  }

  extractCollaborators(
    permissions: FileProcessingResult['permissions'],
    revisions: FileProcessingResult['revisions'],
  ): CollaboratorData[] {
    const collaboratorMap = new Map<string, CollaboratorData>();

    // Extract from permissions
    for (const perm of permissions) {
      if (perm.type === 'user') {
        if (perm.emailAddress) {
          collaboratorMap.set(perm.emailAddress.toLowerCase(), {
            email: perm.emailAddress,
            name: perm.displayName || perm.emailAddress.split('@')[0],
            avatarUrl: perm.photoLink,
            source: 'permissions',
            role: perm.role,
          });
        } else if (perm.displayName) {
          // Handle case where we only have a name (no email) from permissions
          const nameKey = perm.displayName.toLowerCase();
          if (
            !Array.from(collaboratorMap.values()).some(
              (c) => c.name.toLowerCase() === nameKey,
            )
          ) {
            collaboratorMap.set(`name_${nameKey}`, {
              name: perm.displayName,
              avatarUrl: perm.photoLink,
              source: 'permissions',
              role: perm.role,
            });
          }
        }
      }
    }

    // Extract from revisions (may override/update existing entries)
    for (const rev of revisions) {
      const user = rev.lastModifyingUser;
      if (user?.emailAddress) {
        const email = user.emailAddress.toLowerCase();
        const existing = collaboratorMap.get(email);
        collaboratorMap.set(email, {
          email: user.emailAddress,
          name:
            user.displayName ||
            existing?.name ||
            user.emailAddress.split('@')[0],
          avatarUrl: user.photoLink || existing?.avatarUrl,
          source: existing ? 'both' : 'revisions',
          role: existing?.role,
        });
      } else if (user?.displayName) {
        // Handle case where we only have a name (no email) from revisions
        // Only add if we don't already have this person from permissions
        const nameKey = user.displayName.toLowerCase();
        if (
          !Array.from(collaboratorMap.values()).some(
            (c) => c.name.toLowerCase() === nameKey,
          )
        ) {
          collaboratorMap.set(`name_${nameKey}`, {
            name: user.displayName,
            avatarUrl: user.photoLink,
            source: 'revisions',
          });
        }
      }
    }

    return Array.from(collaboratorMap.values());
  }
}

function rowToNullable<T>(val: T | null | undefined): T | undefined {
  return val === null ? undefined : val;
}

