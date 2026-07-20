import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdentityModule } from '../identity/identity.module.js';
import { Room, RoomSchema } from '../rooms/schemas/room.schema.js';
import { Game, GameSchema } from './schemas/game.schema.js';
import { GameEvent, GameEventSchema } from './schemas/game-event.schema.js';
import { GamesController } from './games.controller.js';
import { GamesService } from './games.service.js';
@Module({
  imports: [
    IdentityModule,
    MongooseModule.forFeature([
      { name: Game.name, schema: GameSchema },
      { name: GameEvent.name, schema: GameEventSchema },
      { name: Room.name, schema: RoomSchema }
    ])
  ],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService]
})
export class GamesModule {}
