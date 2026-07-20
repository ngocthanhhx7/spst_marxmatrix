import { Global, Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { ArenaGateway } from './arena.gateway.js';
import { ArenaRealtimePublisher } from './arena-realtime.publisher.js';

@Global()
@Module({ providers: [ArenaRealtimePublisher], exports: [ArenaRealtimePublisher] })
export class ArenaRealtimeModule {}

@Module({
  imports: [ArenaRealtimeModule, IdentityModule, RoomsModule, GamesModule],
  providers: [ArenaGateway]
})
export class ArenaModule {}
