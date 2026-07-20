export class ScannerDomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly details: ReadonlyArray<unknown> = []
  ) {
    super(message);
    this.name = 'ScannerDomainError';
  }
}
