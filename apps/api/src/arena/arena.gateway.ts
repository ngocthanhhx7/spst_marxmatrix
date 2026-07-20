import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { clientToServerEventsSchema, type ApiError } from '@marxmatrix/contracts';
import type { Server } from 'socket.io';
import { z, ZodError } from 'zod';
import { DomainError } from '../common/domain-error.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { toGameEventResponse, toGameSnapshotResponse } from '../games/game-response.js';
import { GamesService } from '../games/games.service.js';
import { toRoomResponse } from '../rooms/room-response.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { ArenaRealtimePublisher } from './arena-realtime.publisher.js';

interface AuthenticatedSocket {
  handshake: {
    auth: Record<string, unknown>;
    headers: { authorization?: string | string[] };
  };
  data: { user?: AuthenticatedUser };
  emit(event: string, payload: unknown): unknown;
  join(channel: string): Promise<void> | void;
  disconnect(close?: boolean): unknown;
}
type RoomSubscription = z.input<(typeof clientToServerEventsSchema)['shape']['room:join']>;
type GameSubscription = z.input<(typeof clientToServerEventsSchema)['shape']['game:sync']>;

@WebSocketGateway({ namespace: '/arena' })
export class ArenaGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer() private server!: Server;

  public constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rooms: RoomsService,
    private readonly games: GamesService,
    private readonly realtime?: ArenaRealtimePublisher
  ) {}

  afterInit(): void {
    this.realtime?.bind(this.server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token = this.accessToken(client);
    if (token === undefined) return this.rejectConnection(client);
    try {
      client.data.user = await this.jwt.verifyAsync<AuthenticatedUser>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
      });
    } catch {
      this.rejectConnection(client);
    }
  }

  @SubscribeMessage('room:join')
  async handleRoomSubscription(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() candidate: RoomSubscription
  ): Promise<void> {
    try {
      const user = this.user(client);
      const payload = clientToServerEventsSchema.shape['room:join'].parse({
        ...candidate,
        code: typeof candidate.code === 'string' ? candidate.code.toUpperCase() : candidate.code
      });
      const room = await this.rooms.getForPlayer(payload.code, user.id);
      await client.join(this.roomChannel(room.code));
      client.emit('room:updated', toRoomResponse(room));
    } catch (error) {
      client.emit('server:error', this.error(error));
    }
  }

  @SubscribeMessage('game:sync')
  async handleGameSubscription(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() candidate: GameSubscription
  ): Promise<void> {
    try {
      const user = this.user(client);
      const payload = clientToServerEventsSchema.shape['game:sync'].parse(candidate);
      const game = await this.games.get(payload.gameId, user.id);
      const events = await this.games.eventsFor(payload.gameId, user.id, 0);
      await client.join(this.gameChannel(payload.gameId));
      client.emit('game:snapshot', toGameSnapshotResponse(game));
      for (const event of [...events].sort((left, right) => left.sequence - right.sequence))
        client.emit('game:event', toGameEventResponse(event));
    } catch (error) {
      client.emit('server:error', this.error(error));
    }
  }

  private accessToken(client: AuthenticatedSocket): string | undefined {
    const authToken = client.handshake.auth['token'];
    if (typeof authToken === 'string' && authToken.length > 0) return authToken;
    const authorization = client.handshake.headers.authorization;
    return typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
  }

  private user(client: AuthenticatedSocket): AuthenticatedUser {
    if (client.data.user === undefined)
      throw new DomainError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401);
    return client.data.user;
  }

  private rejectConnection(client: AuthenticatedSocket): void {
    client.emit(
      'server:error',
      this.error(new DomainError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401))
    );
    client.disconnect(true);
  }

  private error(error: unknown): ApiError {
    if (error instanceof DomainError)
      return {
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
        details: [...error.details],
        requestId: randomUUID()
      };
    if (error instanceof ZodError)
      return {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues,
        requestId: randomUUID()
      };
    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: [],
      requestId: randomUUID()
    };
  }

  private roomChannel(code: string): string {
    return `arena:room:${code.toUpperCase()}`;
  }

  private gameChannel(gameId: string): string {
    return `arena:game:${gameId}`;
  }
}
