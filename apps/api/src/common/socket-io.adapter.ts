import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

export class CorsSocketIoAdapter extends IoAdapter {
  public constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: readonly string[]
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: [...this.allowedOrigins],
        credentials: true
      }
    }) as Server;
  }
}
