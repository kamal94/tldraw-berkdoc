import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { DatabaseService } from '../database/database.service';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) {}

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

    this.logger.log("user.google_access_token:", user.google_access_token)
    this.logger.log("user.google_refresh_token:", user.google_refresh_token)
    this.logger.log("user.google_token_expiry:", user.google_token_expiry)
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

  async listFiles(userId: string) {
    const drive = await this.getDriveClient(userId);
    
    // Query for PDFs and Google Docs
    const q = "(mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.document') and trashed = false";
    
    const response = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
      pageSize: 100, // We could implement pagination if needed
    });

    return response.data.files || [];
  }

  async downloadAndExtractText(userId: string, fileId: string, mimeType: string): Promise<string> {
    const drive = await this.getDriveClient(userId);

    if (mimeType === 'application/vnd.google-apps.document') {
      // Export Google Doc as plain text
      const response = await drive.files.export({
        fileId,
        mimeType: 'text/plain',
      });
      return response.data as string;
    } else if (mimeType === 'application/pdf') {
      // Download PDF as binary
      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );
      
      const buffer = Buffer.from(response.data as ArrayBuffer);
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }

    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

function rowToNullable<T>(val: T | null | undefined): T | undefined {
  return val === null ? undefined : val;
}

