import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextValue {
  requestId: string;
}
export const requestContext = new AsyncLocalStorage<RequestContextValue>();
