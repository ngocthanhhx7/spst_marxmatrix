export class DomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details: ReadonlyArray<unknown> = []
  ) {
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599)
      throw new RangeError('DomainError statusCode must be an HTTP error status.');
    if (code.trim().length === 0 || code.length > 100)
      throw new RangeError('DomainError code must be nonempty and bounded.');
    if (message.trim().length === 0 || message.length > 1000)
      throw new RangeError('DomainError message must be nonempty and bounded.');
    super(message);
    this.name = 'DomainError';
  }
}
