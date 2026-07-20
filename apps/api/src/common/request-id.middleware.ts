import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requestContext } from './request-context.js';

type RequestWithId = IncomingMessage & { id?: string };
const validRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: ServerResponse, next: () => void): void {
    const incoming = request.headers['x-request-id'];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId =
      candidate !== undefined && candidate.length <= 128 && validRequestId.test(candidate)
        ? candidate
        : randomUUID();
    request.id = requestId;
    response.setHeader('x-request-id', requestId);
    requestContext.run({ requestId }, next);
  }
}
