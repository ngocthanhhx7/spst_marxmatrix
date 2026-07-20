import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdentityModule } from '../identity/identity.module.js';
import { GamesModule } from '../games/games.module.js';
import { Room, RoomSchema } from './schemas/room.schema.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';
@Module({
  imports: [
    IdentityModule,
    GamesModule,
    MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }])
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService, MongooseModule]
})
export class RoomsModule {}
