export class DocumentCreatedEvent {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly content: string,
    public readonly source: string,
    public readonly userId: string,
  ) {}
}

export class DocumentUpdatedEvent {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly content: string,
    public readonly source: string,
    public readonly userId: string,
  ) {}
}

export class DocumentDeletedEvent {
  constructor(
    public readonly id: string,
    public readonly userId: string,
  ) {}
}

