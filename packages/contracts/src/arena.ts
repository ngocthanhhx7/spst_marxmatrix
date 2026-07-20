import { z } from 'zod';
import {
  apiErrorSchema,
  finiteNumberSchema,
  isoDateTimeSchema,
  objectIdSchema,
  uuidSchema
} from './common.js';

export const arenaPhaseSchema = z.enum([
  'lobby',
  'countdown',
  'decision_open',
  'decision_locked',
  'round_resolution',
  'crisis_event',
  'round_result',
  'game_over'
]);
export const arenaCrisisSchema = z.enum([
  'overproduction',
  'cloud_price_increase',
  'ai_automation_breakthrough',
  'skilled_labor_shortage',
  'credit_tightening',
  'labor_movement'
]);
const probabilitySchema = finiteNumberSchema.min(0).max(1);
export const gameConfigSchema = z
  .object({
    maxRounds: z.number().int().min(1).max(100),
    minPlayers: z.number().int().min(1).max(16),
    maxPlayers: z.number().int().min(1).max(16),
    startingCash: finiteNumberSchema.min(0),
    startingWorkers: z.number().int().min(0),
    startingWageRate: finiteNumberSchema.min(0),
    decisionDeadlineMs: z.number().int().min(1000).max(3600000),
    countdownMs: z.number().int().min(0).max(60000).default(3000),
    startingCapitalStock: finiteNumberSchema.min(0).default(500),
    startingAutomationLevel: finiteNumberSchema.min(0).default(0),
    startingProductivity: finiteNumberSchema.positive().default(1),
    startingReputation: probabilitySchema.default(0.5),
    startingPrice: finiteNumberSchema.positive().default(20),
    startingInventory: finiteNumberSchema.min(0).default(0),
    startingDebt: finiteNumberSchema.min(0).default(0),
    minimumWageRate: finiteNumberSchema.min(0).default(1),
    minimumPrice: finiteNumberSchema.positive().default(1),
    maximumPrice: finiteNumberSchema.positive().default(1000),
    minimumHiringChange: z.number().int().default(-20),
    maximumHiringChange: z.number().int().default(50),
    minimumWageAdjustment: finiteNumberSchema.min(-1).max(1).default(-0.5),
    maximumWageAdjustment: finiteNumberSchema.min(-1).max(1).default(1),
    maximumAutomationInvestment: finiteNumberSchema.min(0).default(1000),
    maximumQualityMarketingInvestment: finiteNumberSchema.min(0).default(1000),
    maximumInventoryTarget: finiteNumberSchema.min(0).default(10000),
    automationCostPerLevel: finiteNumberSchema.positive().default(100),
    automationProductivityGain: finiteNumberSchema.min(0).default(0.2),
    baseDemandPerCompany: finiteNumberSchema.min(0).default(30),
    inputCostPerUnit: finiteNumberSchema.min(0).default(3),
    capitalDepreciationRate: probabilitySchema.default(0.02),
    inventoryHoldingCostRate: probabilitySchema.default(0.05),
    interestRate: probabilitySchema.default(0.02),
    maximumDebt: finiteNumberSchema.min(0).default(2000),
    reputationDecayRate: probabilitySchema.default(0.02),
    reputationInvestmentScale: finiteNumberSchema.positive().default(100),
    reputationAttractivenessWeight: probabilitySchema.default(0.5),
    priceAttractivenessWeight: probabilitySchema.default(0.5),
    marketShareSmoothing: probabilitySchema.default(0.5),
    crisisProbability: probabilitySchema.default(0.35),
    overproductionDemandMultiplier: finiteNumberSchema.min(0).default(0.65),
    cloudPriceInputCostMultiplier: finiteNumberSchema.min(0).default(1.4),
    automationBreakthroughProductivityMultiplier: finiteNumberSchema.min(0).default(1.2),
    skilledLaborWageMultiplier: finiteNumberSchema.min(0).default(1.15),
    creditTighteningInterestMultiplier: finiteNumberSchema.min(0).default(2),
    laborMovementWageMultiplier: finiteNumberSchema.min(0).default(1.1),
    acquisitionCapitalShare: probabilitySchema.default(0.5),
    acquisitionWorkerShare: probabilitySchema.default(0.5),
    acquisitionMarketShare: probabilitySchema.default(0.5),
    acquisitionInventoryShare: probabilitySchema.default(0.5),
    acquisitionCapitalRecoveryRate: probabilitySchema.default(0.3),
    acquisitionInventoryRecoveryRate: probabilitySchema.default(0.2),
    acquisitionDebtDiscountRate: probabilitySchema.default(0.1)
  })
  .superRefine((config, context) => {
    if (config.maxPlayers < config.minPlayers)
      context.addIssue({
        code: 'custom',
        path: ['maxPlayers'],
        message: 'maxPlayers must be at least minPlayers.'
      });
    if (config.maximumPrice < config.minimumPrice)
      context.addIssue({
        code: 'custom',
        path: ['maximumPrice'],
        message: 'maximumPrice must be at least minimumPrice.'
      });
    if (config.maximumHiringChange < config.minimumHiringChange)
      context.addIssue({
        code: 'custom',
        path: ['maximumHiringChange'],
        message: 'maximumHiringChange must be at least minimumHiringChange.'
      });
    if (config.maximumWageAdjustment < config.minimumWageAdjustment)
      context.addIssue({
        code: 'custom',
        path: ['maximumWageAdjustment'],
        message: 'maximumWageAdjustment must be at least minimumWageAdjustment.'
      });
  });
export const companySnapshotSchema = z.object({
  playerId: objectIdSchema,
  name: z.string().min(1).max(100),
  cash: finiteNumberSchema,
  capitalStock: finiteNumberSchema.min(0),
  workers: finiteNumberSchema.min(0),
  wageRate: finiteNumberSchema.min(0),
  automationLevel: finiteNumberSchema.min(0),
  productivity: finiteNumberSchema.min(0),
  reputation: finiteNumberSchema.min(0).max(1),
  marketShare: finiteNumberSchema.min(0).max(1),
  price: finiteNumberSchema.min(0),
  inventory: finiteNumberSchema.min(0),
  debt: finiteNumberSchema.min(0),
  constantCapital: finiteNumberSchema,
  variableCapital: finiteNumberSchema,
  surplusValue: finiteNumberSchema,
  bankrupt: z.boolean()
});
export const arenaDecisionCoreSchema = z.object({
  round: z.number().int().min(1),
  expectedStateVersion: z.number().int().min(0),
  hiringChange: z.number().int().min(-1000000).max(1000000),
  wageAdjustment: finiteNumberSchema.min(-1).max(1),
  automationInvestment: finiteNumberSchema.min(0).max(1000000000),
  price: finiteNumberSchema.positive().max(1000000000),
  qualityMarketingInvestment: finiteNumberSchema.min(0).max(1000000000),
  inventoryTarget: finiteNumberSchema.min(0).max(1000000000)
});
export const arenaDecisionSchema = arenaDecisionCoreSchema.extend({
  gameId: objectIdSchema,
  idempotencyKey: uuidSchema
});
export const roomPlayerSchema = z.object({
  id: objectIdSchema,
  displayName: z.string().min(1).max(100),
  isBot: z.boolean(),
  ready: z.boolean()
});
export const roomSchema = z.object({
  id: objectIdSchema,
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  hostId: objectIdSchema,
  playerIds: z.array(objectIdSchema),
  readyPlayerIds: z.array(objectIdSchema),
  players: z.array(roomPlayerSchema),
  phase: z.enum(['lobby', 'started']),
  stateVersion: z.number().int().min(0),
  config: gameConfigSchema
});
export const gameSnapshotSchema = z.object({
  id: objectIdSchema,
  roomId: objectIdSchema,
  stateVersion: z.number().int().min(0),
  round: z.number().int().min(1),
  phase: arenaPhaseSchema,
  deadlineAt: isoDateTimeSchema.nullable(),
  config: gameConfigSchema,
  companies: z.array(companySnapshotSchema),
  randomSeed: z.string().min(1).max(256),
  decisions: z.record(objectIdSchema, arenaDecisionCoreSchema),
  crisis: arenaCrisisSchema.nullable(),
  eventSequence: z.number().int().min(0)
});
export const gameEventSchema = z.object({
  id: objectIdSchema,
  gameId: objectIdSchema,
  sequence: z.number().int().min(1),
  type: z.string().min(1).max(100),
  round: z.number().int().min(1),
  playerId: objectIdSchema.nullable(),
  createdAt: isoDateTimeSchema,
  payload: z.record(z.string(), z.unknown())
});
export const replaySchema = z.object({
  game: gameSnapshotSchema,
  events: z.array(gameEventSchema)
});
export const clientToServerEventsSchema = z.object({
  'room:join': z.object({
    code: z.string().regex(/^[A-Z0-9]{6}$/),
    expectedStateVersion: z.number().int().min(0)
  }),
  'room:ready': z.object({ roomId: objectIdSchema, expectedStateVersion: z.number().int().min(0) }),
  'room:start': z.object({ roomId: objectIdSchema, expectedStateVersion: z.number().int().min(0) }),
  'game:decision': arenaDecisionSchema,
  'game:sync': z.object({ gameId: objectIdSchema, expectedStateVersion: z.number().int().min(0) })
});
export const serverToClientEventsSchema = z.object({
  'server:error': apiErrorSchema,
  'room:updated': roomSchema,
  'game:snapshot': gameSnapshotSchema,
  'game:event': gameEventSchema
});
export type GameConfig = z.infer<typeof gameConfigSchema>;
export type CompanySnapshot = z.infer<typeof companySnapshotSchema>;
export type ArenaDecision = z.infer<typeof arenaDecisionSchema>;
export type ArenaDecisionCore = z.infer<typeof arenaDecisionCoreSchema>;
export type ArenaCrisis = z.infer<typeof arenaCrisisSchema>;
export type RoomPlayer = z.infer<typeof roomPlayerSchema>;
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;
export type GameEvent = z.infer<typeof gameEventSchema>;
export type ArenaReplay = z.infer<typeof replaySchema>;
export interface ClientToServerEvents {
  'room:join': (
    payload: z.infer<(typeof clientToServerEventsSchema)['shape']['room:join']>
  ) => void;
  'room:ready': (
    payload: z.infer<(typeof clientToServerEventsSchema)['shape']['room:ready']>
  ) => void;
  'room:start': (
    payload: z.infer<(typeof clientToServerEventsSchema)['shape']['room:start']>
  ) => void;
  'game:decision': (payload: z.infer<typeof arenaDecisionSchema>) => void;
  'game:sync': (
    payload: z.infer<(typeof clientToServerEventsSchema)['shape']['game:sync']>
  ) => void;
}
export interface ServerToClientEvents {
  'server:error': (payload: z.infer<typeof apiErrorSchema>) => void;
  'room:updated': (payload: z.infer<typeof roomSchema>) => void;
  'game:snapshot': (payload: z.infer<typeof gameSnapshotSchema>) => void;
  'game:event': (payload: z.infer<typeof gameEventSchema>) => void;
}
