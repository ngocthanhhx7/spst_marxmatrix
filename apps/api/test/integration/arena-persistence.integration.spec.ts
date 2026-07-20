import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { gameEventSchema } from '@marxmatrix/contracts';
import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GamesService } from '../../src/games/games.service.js';
import { Game } from '../../src/games/schemas/game.schema.js';
import { GameEvent } from '../../src/games/schemas/game-event.schema.js';
import { Room } from '../../src/rooms/schemas/room.schema.js';
import { DomainError } from '../../src/common/domain-error.js';

const dbName = `marxmatrix_arena_${process.pid}_${Date.now()}`;
let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;

beforeAll(async () => {
  Object.assign(process.env, {
    MARXMATRIX_SKIP_ENV_FILE: 'true',
    NODE_ENV: 'test',
    PORT: '3000',
    FRONTEND_URL: 'http://localhost:5173',
    CORS_ORIGINS: 'http://localhost:5173',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    MONGODB_DB_NAME: dbName,
    GRIDFS_BUCKET_NAME: 'uploads',
    JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
    JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    JWT_REFRESH_MAX_AGE_MS: '604800000',
    AUTH_COOKIE_NAME: 'marxmatrix_refresh',
    AUTH_COOKIE_SAME_SITE: 'lax',
    COOKIE_SECURE: 'false',
    AI_PROVIDER: 'mock',
    AI_REQUEST_TIMEOUT_MS: '15000',
    AI_MAX_RETRIES: '2',
    DOCUMENT_MAX_SIZE_MB: '20',
    DOCUMENT_ALLOWED_MIME_TYPES: 'application/pdf',
    RATE_LIMIT_TTL_MS: '60000',
    RATE_LIMIT_MAX: '1000',
    LOG_LEVEL: 'error',
    DEMO_MODE: 'false'
  });
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApplication } = await import('../../src/main.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApplication(app);
  await app.init();
  server = app.getHttpServer();
}, 30_000);

afterAll(async () => {
  if (app === undefined) return;
  await app.get<{ dropDatabase(): Promise<void> }>('DatabaseConnection').dropDatabase();
  await app.close();
});

describe('durable Arena rooms and games', () => {
  it('enforces lobby rules and repairs durable ordered events', async () => {
    const register = async (label: string) => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send({
          email: `arena-${label}-${Date.now()}@example.test`,
          password: 'correct horse battery staple',
          displayName: label
        })
        .expect(201);
      return {
        id: response.body.user.id as string,
        auth: { Authorization: `Bearer ${response.body.accessToken as string}` }
      };
    };
    const host = await register('Host');
    const guest = await register('Guest');
    const outsider = await register('Outsider');

    await request(server)
      .post('/api/v1/rooms')
      .set(host.auth)
      .send({ displayName: 'Host', config: { unknownCoefficient: 1 } })
      .expect(400);
    const created = await request(server)
      .post('/api/v1/rooms')
      .set(host.auth)
      .send({
        displayName: 'Host',
        config: { minPlayers: 2, maxPlayers: 2, countdownMs: 0, decisionDeadlineMs: 100000 }
      })
      .expect(201);
    const code = created.body.code as string;
    await request(server).get(`/api/v1/rooms/${code}`).set(outsider.auth).expect(404);

    await Promise.all([
      request(server)
        .post(`/api/v1/rooms/${code}/join`)
        .set(guest.auth)
        .send({ displayName: 'Guest' })
        .expect(201),
      request(server)
        .post(`/api/v1/rooms/${code}/join`)
        .set(guest.auth)
        .send({ displayName: 'Guest' })
        .expect(201)
    ]);
    let room = await request(server).get(`/api/v1/rooms/${code}`).set(host.auth).expect(200);
    expect(room.body.playerIds).toHaveLength(2);
    await request(server)
      .post(`/api/v1/rooms/${code}/join`)
      .set(outsider.auth)
      .send({ displayName: 'Outsider' })
      .expect(409);

    room = await request(server)
      .post(`/api/v1/rooms/${code}/ready`)
      .set(host.auth)
      .send({ expectedStateVersion: room.body.stateVersion })
      .expect(201);
    room = await request(server)
      .post(`/api/v1/rooms/${code}/ready`)
      .set(guest.auth)
      .send({ expectedStateVersion: room.body.stateVersion })
      .expect(201);
    await request(server)
      .post(`/api/v1/rooms/${code}/start`)
      .set(guest.auth)
      .send({ expectedStateVersion: room.body.stateVersion })
      .expect(403);
    const started = await request(server)
      .post(`/api/v1/rooms/${code}/start`)
      .set(host.auth)
      .send({ expectedStateVersion: room.body.stateVersion })
      .expect(201);
    const gameId = started.body.id as string;
    const retried = await request(server)
      .post(`/api/v1/rooms/${code}/start`)
      .set(host.auth)
      .send({ expectedStateVersion: room.body.stateVersion })
      .expect(201);
    expect(retried.body.id).toBe(gameId);
    await request(server)
      .post(`/api/v1/rooms/${code}/join`)
      .set(outsider.auth)
      .send({ displayName: 'Outsider' })
      .expect(409);
    await request(server).get(`/api/v1/games/${gameId}`).set(outsider.auth).expect(404);

    const roomModel = app.get<Model<Room>>(getModelToken(Room.name));
    await expect(roomModel.findOne({ code }).lean()).resolves.toMatchObject({
      phase: 'started',
      expiresAt: null
    });
    const games = app.get(GamesService);
    const opened = await games.recoverOverdue(gameId, Date.now() + 1);
    const decisions = [host, guest].map((player) => ({
      player,
      decision: {
        gameId,
        idempotencyKey: randomUUID(),
        round: 1,
        expectedStateVersion: opened.stateVersion,
        hiringChange: 0,
        wageAdjustment: 0,
        automationInvestment: 0,
        price: 20,
        qualityMarketingInvestment: 0,
        inventoryTarget: 30
      }
    }));
    const submissions = await Promise.allSettled(
      decisions.map(({ player, decision }) => games.submitDecision(gameId, player.id, decision))
    );
    expect(submissions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(submissions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winnerIndex = submissions.findIndex((result) => result.status === 'fulfilled');
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winner = submissions[winnerIndex];
    const loser = submissions[loserIndex];
    if (
      winner?.status !== 'fulfilled' ||
      loser?.status !== 'rejected' ||
      !(loser.reason instanceof DomainError)
    )
      throw new Error('Expected one durable decision and one domain conflict.');
    expect(loser.reason.code).toBe('STALE_STATE_VERSION');
    const loserInput = decisions[loserIndex];
    if (!loserInput) throw new Error('Missing losing decision fixture.');
    const retriedLoser = await games.submitDecision(gameId, loserInput.player.id, {
      ...loserInput.decision,
      expectedStateVersion: winner.value.stateVersion
    });
    const winnerInput = decisions[winnerIndex];
    if (!winnerInput) throw new Error('Missing winning decision fixture.');
    await expect(
      games.submitDecision(gameId, winnerInput.player.id, winnerInput.decision)
    ).resolves.toMatchObject({ stateVersion: retriedLoser.stateVersion });

    const eventModel = app.get<Model<GameEvent>>(getModelToken(GameEvent.name));
    const beforeRepair = await eventModel.find({ gameId }).sort({ sequence: 1 }).lean();
    expect(beforeRepair.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    const gameModel = app.get<Model<Game>>(getModelToken(Game.name));
    await gameModel.updateOne(
      { _id: gameId },
      {
        $push: {
          pendingEvents: {
            sequence: 5,
            type: 'crisis_triggered',
            round: 1,
            playerId: null,
            idempotencyKey: null,
            payload: { crisis: 'credit_tightening' },
            createdAt: new Date()
          }
        }
      }
    );
    await request(server).get(`/api/v1/games/${gameId}`).set(host.auth).expect(200);
    const events = await request(server)
      .get(`/api/v1/games/${gameId}/events`)
      .set(host.auth)
      .expect(200);
    const eventBodies = gameEventSchema.array().parse(events.body as unknown);
    expect(eventBodies.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(eventBodies[4]).toMatchObject({
      round: 1,
      playerId: null,
      payload: { crisis: 'credit_tightening' }
    });
    const replay = await request(server)
      .get(`/api/v1/games/${gameId}/replay`)
      .set(host.auth)
      .expect(200);
    const replayEvents = gameEventSchema.array().parse((replay.body as { events: unknown }).events);
    expect(replayEvents).toHaveLength(5);

    const botRoomResponse = await request(server)
      .post('/api/v1/rooms')
      .set(host.auth)
      .send({
        displayName: 'Host',
        config: { minPlayers: 1, maxPlayers: 2 }
      })
      .expect(201);
    const botCode = botRoomResponse.body.code as string;
    const withBot = await request(server)
      .post(`/api/v1/rooms/${botCode}/demo-bot`)
      .set(host.auth)
      .expect(201);
    expect((withBot.body as { playerIds: string[] }).playerIds).toHaveLength(2);
    await request(server).post(`/api/v1/rooms/${botCode}/demo-bot`).set(host.auth).expect(409);
    await request(server).post(`/api/v1/rooms/${botCode}/leave`).set(host.auth).expect(201);
    await request(server).get(`/api/v1/rooms/${botCode}`).set(host.auth).expect(404);
  }, 30_000);
});
