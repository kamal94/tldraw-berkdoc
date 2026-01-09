export class GoogleDriveSyncRequestedEvent {
  constructor(public readonly userId: string) {}
}

export class GoogleDriveFileDiscoveredEvent {
  constructor(
    public readonly userId: string,
    public readonly file: {
      id: string;
      name: string;
      mimeType: string;
      modifiedTime: string;
      webViewLink?: string;
    },
  ) {}
}

