import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatRunRegistry {
  private readonly controllers = new Map<string, AbortController>();

  public register(ownerId: string, runId: string): AbortController {
    const controller = new AbortController();
    this.controllers.set(this.key(ownerId, runId), controller);
    return controller;
  }

  public cancel(ownerId: string, runId: string): boolean {
    const controller = this.controllers.get(this.key(ownerId, runId));
    if (controller === undefined) return false;
    controller.abort();
    return true;
  }

  public release(ownerId: string, runId: string): void {
    this.controllers.delete(this.key(ownerId, runId));
  }

  private key(ownerId: string, runId: string): string {
    return `${ownerId}:${runId}`;
  }
}
