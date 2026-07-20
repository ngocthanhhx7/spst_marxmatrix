import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  public constructor(private readonly logger: Logger) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ id?: string; method: string; url: string }>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const startedAt = performance.now();
    return next.handle().pipe(
      tap(() =>
        this.logger.log(
          {
            requestId: request.id,
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            latencyMs: Math.round(performance.now() - startedAt)
          },
          'request completed'
        )
      )
    );
  }
}
