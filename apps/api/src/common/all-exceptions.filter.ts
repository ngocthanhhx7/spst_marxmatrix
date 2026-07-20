import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';
import { apiErrorSchema, type ApiError } from '@marxmatrix/contracts';
import { DomainError } from './domain-error.js';

type RequestWithId = { id?: string };
type ResponseLike = { status(statusCode: number): ResponseLike; json(body: ApiError): unknown };
export interface ExceptionLogger {
  error(payload: unknown, message?: string): void;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  public constructor(
    private readonly options: { isProduction: boolean },
    private readonly logger?: ExceptionLogger
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ResponseLike>();
    const request = host.switchToHttp().getRequest<RequestWithId>();
    if (
      !(exception instanceof DomainError) &&
      !(exception instanceof ZodError) &&
      !(exception instanceof HttpException)
    )
      this.logger?.error({ err: exception, requestId: request.id }, 'unexpected exception');
    const body = this.serialize(exception, host);
    response.status(body.statusCode).json(body);
  }

  serialize(exception: unknown, host: ArgumentsHost): ApiError {
    const request = host.switchToHttp().getRequest<RequestWithId>();
    const requestId = request.id ?? '00000000-0000-4000-8000-000000000000';
    if (exception instanceof DomainError)
      return this.safe({
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        requestId
      });
    if (exception instanceof ZodError)
      return this.safe({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: exception.issues,
        requestId
      });
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const bodyRecord =
        typeof body === 'object' && body !== null
          ? (body as { message?: string | string[]; issues?: ReadonlyArray<unknown> })
          : undefined;
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray(bodyRecord?.message)
            ? bodyRecord.message.join(', ')
            : (bodyRecord?.message ?? exception.message);
      return this.safe({
        statusCode: exception.getStatus(),
        code: bodyRecord?.issues === undefined ? 'HTTP_ERROR' : 'VALIDATION_ERROR',
        message,
        details: bodyRecord?.issues ?? [],
        requestId
      });
    }
    return this.safe({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: [],
      requestId
    });
  }

  private safe(candidate: ApiError): ApiError {
    const parsed = apiErrorSchema.safeParse(candidate);
    return parsed.success
      ? parsed.data
      : {
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
          details: [],
          requestId: '00000000-0000-4000-8000-000000000000'
        };
  }

  private statusCode(exception: unknown): number {
    if (exception instanceof DomainError) return exception.statusCode;
    if (exception instanceof ZodError) return 400;
    if (exception instanceof HttpException) return exception.getStatus();
    return 500;
  }
}
