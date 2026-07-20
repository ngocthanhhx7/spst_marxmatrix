import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { PasswordService } from './password.service.js';
import { RefreshSession, RefreshSessionSchema } from './schemas/refresh-session.schema.js';
import { User, UserSchema } from './schemas/user.schema.js';
import { TokenService } from './token.service.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
@Module({
  imports: [
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshSession.name, schema: RefreshSessionSchema }
    ])
  ],
  controllers: [IdentityController],
  providers: [IdentityService, PasswordService, TokenService, AuthGuard, RolesGuard],
  exports: [IdentityService, AuthGuard, RolesGuard, JwtModule]
})
export class IdentityModule {}
