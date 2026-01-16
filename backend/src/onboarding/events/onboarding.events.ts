/**
 * Events for onboarding flow
 */

export class MetadataScanRequestedEvent {
  constructor(
    public readonly userId: string,
    public readonly scanId: string,
  ) {}
}

export class MetadataScanCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly scanId: string,
    public readonly totalFileCount: number,
    public readonly supportedFileCount: number,
  ) {}
}

export class ProcessingConfirmedEvent {
  constructor(
    public readonly userId: string,
    public readonly options: {
      prioritizeShared?: boolean;
      prioritizeRecent?: boolean;
      skipDrafts?: boolean;
    },
  ) {}
}

export class FileProcessedEvent {
  constructor(
    public readonly userId: string,
    public readonly documentId: string,
    public readonly fileId: string,
  ) {}
}

export class ProcessingCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly totalProcessed: number,
  ) {}
}
