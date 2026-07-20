import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { arenaDecisionSchema } from '@marxmatrix/contracts';
import { z } from 'zod';
import { createZodDto } from '../common/zod-validation.pipe.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { GamesService } from './games.service.js';
import { ArenaRealtimePublisher } from '../arena/arena-realtime.publisher.js';
import { toGameEventResponse, toGameSnapshotResponse } from './game-response.js';
class DecisionBody extends createZodDto(arenaDecisionSchema) {}
class EventsQuery extends createZodDto(
  z.object({ after: z.coerce.number().int().min(0).default(0) })
) {}
@Controller('games')
@UseGuards(AuthGuard)
export class GamesController {
  public constructor(
    private readonly games: GamesService,
    private readonly realtime: ArenaRealtimePublisher
  ) {}
  @Get(':id') async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.game(await this.games.get(id, user.id));
  }
  @Get(':id/events') async events(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: EventsQuery
  ) {
    return (await this.games.eventsFor(id, user.id, query.after)).map((event) => this.event(event));
  }
  @Get(':id/replay') async replay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const replay = await this.games.replay(id, user.id);
    return {
      game: this.game(replay.game),
      events: replay.events.map((event) => this.event(event))
    };
  }
  @Post(':id/decisions') async decision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: DecisionBody
  ) {
    const game = await this.games.submitDecision(id, user.id, body);
    const response = this.game(game);
    const events = (await this.games.eventsFor(id, user.id, 0)).map(toGameEventResponse);
    this.realtime.publishGame(response, events);
    return response;
  }
  private game(game: Awaited<ReturnType<GamesService['get']>>) {
    return toGameSnapshotResponse(game);
  }
  private event(event: Awaited<ReturnType<GamesService['eventsFor']>>[number]) {
    return toGameEventResponse(event);
  }
}
