import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type authResponseSchema
} from '@marxmatrix/contracts';
import type { z } from 'zod';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { DomainError } from '../common/domain-error.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { PasswordService } from './password.service.js';
import { RefreshSession } from './schemas/refresh-session.schema.js';
import { User, type UserDocument } from './schemas/user.schema.js';
import { TokenService } from './token.service.js';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const invalidCredentials = (): DomainError =>
  new DomainError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
type SessionResult = AuthResponse & { refreshToken: string };
type AuthResponse = z.infer<typeof authResponseSchema>;

@Injectable()
export class IdentityService {
  public constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(RefreshSession.name) private readonly sessions: Model<RefreshSession>,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService
  ) {}
  async register(input: RegisterInput): Promise<SessionResult> {
    const email = normalizeEmail(input.email);
    if (await this.users.findOne({ email }).lean())
      throw new ConflictException('Unable to register this account.');
    try {
      const user = await this.users.create({
        email,
        displayName: input.displayName.trim(),
        passwordHash: await this.passwords.hash(input.password),
        role: 'student'
      });
      return this.issue(user);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ConflictException('Unable to register this account.');
      throw error;
    }
  }
  async login(input: LoginInput): Promise<SessionResult> {
    const user = await this.users
      .findOne({ email: normalizeEmail(input.email) })
      .select('+passwordHash');
    if (user === null || !(await this.passwords.verify(input.password, user.passwordHash)))
      throw invalidCredentials();
    return this.issue(user);
  }
  async refresh(rawToken: string | undefined): Promise<SessionResult> {
    if (rawToken === undefined || rawToken === '')
      throw new UnauthorizedException('Refresh session is invalid.');
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const now = new Date();
    const lockHash = randomBytes(24).toString('hex');
    const old = await this.sessions.findOneAndUpdate(
      {
        tokenHash,
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
        $or: [{ rotationLockHash: { $exists: false } }, { rotationLockExpiresAt: { $lte: now } }]
      },
      {
        $set: {
          rotationLockHash: lockHash,
          rotationLockExpiresAt: new Date(now.getTime() + 30_000)
        }
      },
      { returnDocument: 'before' }
    );
    if (old === null) throw new UnauthorizedException('Refresh session is invalid.');
    let user: UserDocument;
    let refreshToken: string;
    let replacementHash: string;
    let accessToken: string;
    try {
      const foundUser = await this.users.findById(old.userId);
      if (foundUser === null) throw new UnauthorizedException('Refresh session is invalid.');
      user = foundUser;
      refreshToken = this.tokens.newRefreshToken();
      replacementHash = this.tokens.hashRefreshToken(refreshToken);
      accessToken = await this.tokens.accessToken(this.authenticated(user));
      await this.sessions.create({
        tokenHash: replacementHash,
        userId: user._id,
        expiresAt: this.tokens.refreshExpiry()
      });
    } catch (error) {
      await this.releaseRotationLock(old._id, lockHash);
      throw error;
    }

    const result = { accessToken, user: this.publicUser(user), refreshToken };
    try {
      const handedOff = await this.sessions.updateOne(
        { _id: old._id, rotationLockHash: lockHash, revokedAt: { $exists: false } },
        {
          $set: { revokedAt: new Date(), replacedByHash: replacementHash },
          $unset: { rotationLockHash: '', rotationLockExpiresAt: '' }
        }
      );
      if (handedOff.modifiedCount !== 1)
        throw new UnauthorizedException('Refresh session is invalid.');

      return result;
    } catch (error) {
      const observed = await this.sessions.findById(old._id).lean();
      if (observed?.revokedAt !== undefined && observed.replacedByHash === replacementHash)
        return result;

      await this.sessions.deleteOne({ tokenHash: replacementHash });
      await this.releaseRotationLock(old._id, lockHash);
      throw error;
    }
  }

  private async releaseRotationLock(sessionId: unknown, lockHash: string): Promise<void> {
    await this.sessions.updateOne(
      { _id: sessionId, rotationLockHash: lockHash, revokedAt: { $exists: false } },
      { $unset: { rotationLockHash: '', rotationLockExpiresAt: '' } }
    );
  }
  async logout(rawToken?: string): Promise<void> {
    if (rawToken !== undefined)
      await this.sessions.updateOne(
        { tokenHash: this.tokens.hashRefreshToken(rawToken), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
      );
  }
  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId).lean();
    if (user === null) throw new UnauthorizedException('Authentication is required.');
    return this.publicUser(user);
  }
  private async issue(user: UserDocument): Promise<SessionResult> {
    const refreshToken = this.tokens.newRefreshToken();
    await this.sessions.create({
      tokenHash: this.tokens.hashRefreshToken(refreshToken),
      userId: user._id,
      expiresAt: this.tokens.refreshExpiry()
    });
    return {
      accessToken: await this.tokens.accessToken(this.authenticated(user)),
      user: this.publicUser(user),
      refreshToken
    };
  }
  private authenticated(
    user: Pick<User, 'email' | 'role'> & { _id: Types.ObjectId }
  ): AuthenticatedUser {
    return { id: user._id.toString(), email: user.email, role: user.role };
  }
  private publicUser(
    user: Pick<User, 'email' | 'displayName' | 'role'> & { _id: Types.ObjectId }
  ): PublicUser {
    return {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      role: user.role
    };
  }
}
