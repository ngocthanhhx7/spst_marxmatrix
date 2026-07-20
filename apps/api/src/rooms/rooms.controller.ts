import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createZodDto } from '../common/zod-validation.pipe.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { GamesService } from '../games/games.service.js';
import { RoomsService } from './rooms.service.js';
import { toRoomResponse } from './room-response.js';
import { ArenaRealtimePublisher } from '../arena/arena-realtime.publisher.js';
import { toGameSnapshotResponse } from '../games/game-response.js';
import {
  createRoomInputSchema,
  joinRoomInputSchema,
  roomVersionInputSchema
} from './room-input.js';

class CreateRoomBody extends createZodDto(createRoomInputSchema) {}
class JoinRoomBody extends createZodDto(joinRoomInputSchema) {}
class VersionBody extends createZodDto(roomVersionInputSchema) {}

@Controller('rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  public constructor(
    private readonly rooms: RoomsService,
    private readonly games: GamesService,
    private readonly realtime: ArenaRealtimePublisher
  ) {}
  @Post() async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateRoomBody) {
    const response = this.room(await this.rooms.create(user.id, body.displayName, body.config));
    this.realtime.publishRoom(response);
    return response;
  }
  @Get(':code') async get(@CurrentUser() user: AuthenticatedUser, @Param('code') code: string) {
    return this.room(await this.rooms.getForPlayer(code, user.id));
  }
  @Post(':code/join') async join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: JoinRoomBody
  ) {
    const response = this.room(await this.rooms.join(code, user.id, body.displayName));
    this.realtime.publishRoom(response);
    return response;
  }
  @Post(':code/leave') async leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string
  ) {
    const room = await this.rooms.leave(code, user.id);
    if (room === null) return null;
    const response = this.room(room);
    this.realtime.publishRoom(response);
    return response;
  }
  @Post(':code/ready') async ready(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: VersionBody
  ) {
    const response = this.room(await this.rooms.setReady(code, user.id, body.expectedStateVersion));
    this.realtime.publishRoom(response);
    return response;
  }
  @Post(':code/demo-bot') async demoBot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string
  ) {
    const response = this.room(await this.rooms.addDemoBot(code, user.id));
    this.realtime.publishRoom(response);
    return response;
  }
  @Post(':code/start') async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() body: VersionBody
  ) {
    const room = await this.rooms.start(code, user.id, body.expectedStateVersion);
    this.realtime.publishRoom(this.room(room));
    const game = await this.games.createForStartedRoom(String(room._id));
    const response = this.game(game);
    this.realtime.publishGame(response);
    return response;
  }
  private room(room: Awaited<ReturnType<RoomsService['create']>>) {
    return toRoomResponse(room);
  }
  private game(game: Awaited<ReturnType<GamesService['get']>>) {
    return toGameSnapshotResponse(game);
  }
}
