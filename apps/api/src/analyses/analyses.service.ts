import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type {
  AnalysisDetail,
  AnalysisListItem,
  CreateAnalysisInput,
  FinancialFact,
  StoredFinancialFact,
  UpdateAnalysisFactInput
} from '@marxmatrix/contracts';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { DomainError } from '../common/domain-error.js';
import { CalculationService } from './domain/calculation.service.js';
import { ScannerDomainError } from './domain/scanner-domain-error.js';
import type { ScannerFact } from './domain/scanner-types.js';
import {
  Analysis,
  type AnalysisDocument,
  type StoredCalculationVersion
} from './schemas/analysis.schema.js';

@Injectable()
export class AnalysesService {
  public constructor(
    @InjectModel(Analysis.name) private readonly analyses: Model<Analysis>,
    private readonly calculator: CalculationService
  ) {}

  async create(
    ownerId: string,
    input: CreateAnalysisInput,
    idempotencyKey?: string
  ): Promise<AnalysisDetail> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    const operationKey = this.optionalIdempotencyKey(idempotencyKey);
    const requestFingerprint = this.requestFingerprint(input);
    if (operationKey !== undefined) {
      const existing = await this.analyses.findOne({
        ownerId: ownerObjectId,
        createIdempotencyKey: operationKey
      });
      if (existing !== null) {
        this.assertMatchingCreateRequest(existing, requestFingerprint);
        return this.detail(existing);
      }
    }
    try {
      const analysis = await this.analyses.create({
        ownerId: ownerObjectId,
        ...(operationKey === undefined ? {} : { createIdempotencyKey: operationKey }),
        ...(operationKey === undefined ? {} : { createRequestFingerprint: requestFingerprint }),
        title: input.title,
        facts: input.facts,
        assumptions: input.assumptions,
        calculationVersions: [],
        finalized: false,
        stateVersion: 0,
        nextCalculationVersion: 1
      });
      return this.detail(analysis);
    } catch (error: unknown) {
      if (operationKey !== undefined && this.isDuplicateKey(error)) {
        const existing = await this.analyses.findOne({
          ownerId: ownerObjectId,
          createIdempotencyKey: operationKey
        });
        if (existing !== null) {
          this.assertMatchingCreateRequest(existing, requestFingerprint);
          return this.detail(existing);
        }
      }
      throw error;
    }
  }

  async list(ownerId: string): Promise<AnalysisListItem[]> {
    return (
      await this.analyses.find({ ownerId: new Types.ObjectId(ownerId) }).sort({ updatedAt: -1 })
    ).map((analysis) => ({
      id: analysis._id.toString(),
      title: analysis.title,
      createdAt: analysis.createdAt.toISOString(),
      updatedAt: analysis.updatedAt.toISOString()
    }));
  }

  async find(ownerId: string, id: string): Promise<AnalysisDetail> {
    return this.detail(await this.owned(ownerId, id));
  }

  async updateFact(
    ownerId: string,
    id: string,
    factId: string,
    input: UpdateAnalysisFactInput
  ): Promise<AnalysisDetail> {
    const analysis = await this.mutableOwned(ownerId, id);
    const fact = analysis.facts.find((candidate) => candidate._id?.toString() === factId);
    if (fact === undefined)
      throw new DomainError('FACT_NOT_FOUND', 'Financial fact was not found.', 404);
    const set = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [`facts.$[fact].${key}`, value])
    );
    const updated = await this.analyses.findOneAndUpdate(
      {
        _id: analysis._id,
        ownerId: new Types.ObjectId(ownerId),
        finalized: false,
        stateVersion: analysis.stateVersion
      },
      { $set: set, $inc: { stateVersion: 1 } },
      {
        returnDocument: 'after',
        runValidators: true,
        arrayFilters: [{ 'fact._id': new Types.ObjectId(factId) }]
      }
    );
    if (updated === null) return this.throwStateConflict(ownerId, id);
    return this.detail(updated);
  }

  async updateAssumptions(
    ownerId: string,
    id: string,
    assumptions: AnalysisDetail['assumptions']
  ): Promise<AnalysisDetail> {
    const analysis = await this.mutableOwned(ownerId, id);
    const updated = await this.analyses.findOneAndUpdate(
      {
        _id: analysis._id,
        ownerId: new Types.ObjectId(ownerId),
        finalized: false,
        stateVersion: analysis.stateVersion
      },
      { $set: { assumptions }, $inc: { stateVersion: 1 } },
      { returnDocument: 'after', runValidators: true }
    );
    if (updated === null) return this.throwStateConflict(ownerId, id);
    return this.detail(updated);
  }

  async versions(ownerId: string, id: string): Promise<AnalysisDetail['calculationVersions']> {
    return this.detail(await this.owned(ownerId, id)).calculationVersions;
  }

  async calculate(
    ownerId: string,
    id: string,
    finalize = false,
    idempotencyKey?: string
  ): Promise<AnalysisDetail> {
    const analysis = await this.owned(ownerId, id);
    const operationKey = this.requiredOperationKey(idempotencyKey);
    const operation = finalize ? 'finalize' : 'calculate';
    const existingVersion = analysis.calculationVersions.find(
      (version) => version.idempotencyKey === operationKey
    );
    if (existingVersion !== undefined) {
      this.assertMatchingCalculationOperation(existingVersion.operation, operation);
      return this.detail(analysis);
    }
    if (analysis.finalized)
      throw new DomainError(
        'ANALYSIS_FINALIZED',
        'A finalized analysis cannot be recalculated.',
        409
      );
    try {
      const result = this.calculator.calculate(
        this.toScannerFacts(analysis.facts),
        analysis.assumptions
      );
      const version: StoredCalculationVersion = {
        _id: new Types.ObjectId(),
        idempotencyKey: operationKey,
        operation,
        version: analysis.nextCalculationVersion,
        createdAt: new Date(),
        assumptions: { ...analysis.assumptions },
        result
      };
      const updated = await this.analyses.findOneAndUpdate(
        {
          _id: analysis._id,
          ownerId: new Types.ObjectId(ownerId),
          finalized: false,
          stateVersion: analysis.stateVersion,
          'calculationVersions.idempotencyKey': { $ne: operationKey }
        },
        {
          $push: { calculationVersions: version },
          $inc: { stateVersion: 1, nextCalculationVersion: 1 },
          $set: { finalized: finalize }
        },
        { returnDocument: 'after', runValidators: true }
      );
      if (updated !== null) return this.detail(updated);
      const current = await this.owned(ownerId, id);
      const completedVersion = current.calculationVersions.find(
        (candidate) => candidate.idempotencyKey === operationKey
      );
      if (completedVersion !== undefined) {
        this.assertMatchingCalculationOperation(completedVersion.operation, operation);
        return this.detail(current);
      }
      if (current.finalized)
        throw new DomainError(
          'ANALYSIS_FINALIZED',
          'A finalized analysis cannot be recalculated.',
          409
        );
      throw new DomainError(
        'ANALYSIS_STATE_CONFLICT',
        'Analysis state changed while the operation was in progress.',
        409
      );
    } catch (error: unknown) {
      if (error instanceof ScannerDomainError)
        throw new DomainError(error.code, error.message, 422, error.details);
      throw error;
    }
  }

  private async owned(ownerId: string, id: string): Promise<AnalysisDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new DomainError('ANALYSIS_NOT_FOUND', 'Analysis was not found.', 404);
    const analysis = await this.analyses.findOne({
      _id: new Types.ObjectId(id),
      ownerId: new Types.ObjectId(ownerId)
    });
    if (analysis === null)
      throw new DomainError('ANALYSIS_NOT_FOUND', 'Analysis was not found.', 404);
    return analysis;
  }
  private async mutableOwned(ownerId: string, id: string): Promise<AnalysisDocument> {
    const analysis = await this.owned(ownerId, id);
    if (analysis.finalized)
      throw new DomainError('ANALYSIS_FINALIZED', 'A finalized analysis cannot be changed.', 409);
    return analysis;
  }

  private async throwStateConflict(ownerId: string, id: string): Promise<never> {
    const current = await this.owned(ownerId, id);
    if (current.finalized)
      throw new DomainError('ANALYSIS_FINALIZED', 'A finalized analysis cannot be changed.', 409);
    throw new DomainError(
      'ANALYSIS_STATE_CONFLICT',
      'Analysis state changed while the operation was in progress.',
      409
    );
  }

  private optionalIdempotencyKey(idempotencyKey?: string): string | undefined {
    if (idempotencyKey === undefined) return undefined;
    const normalized = idempotencyKey.trim();
    if (normalized.length === 0 || normalized.length > 200)
      throw new DomainError(
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key must contain between 1 and 200 characters.',
        400
      );
    return normalized;
  }

  private requiredOperationKey(idempotencyKey?: string): string {
    return this.optionalIdempotencyKey(idempotencyKey) ?? new Types.ObjectId().toString();
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private requestFingerprint(input: CreateAnalysisInput): string {
    const canonicalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (typeof value !== 'object' || value === null) return value;
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonicalize(child)])
      );
    };
    return createHash('sha256')
      .update(JSON.stringify(canonicalize(input)))
      .digest('hex');
  }

  private assertMatchingCreateRequest(
    analysis: AnalysisDocument,
    requestFingerprint: string
  ): void {
    if (analysis.createRequestFingerprint !== requestFingerprint)
      throw new DomainError(
        'IDEMPOTENCY_KEY_CONFLICT',
        'Idempotency-Key was already used for a different create request.',
        409
      );
  }

  private assertMatchingCalculationOperation(
    completedOperation: StoredCalculationVersion['operation'],
    requestedOperation: StoredCalculationVersion['operation']
  ): void {
    if (completedOperation !== requestedOperation)
      throw new DomainError(
        'IDEMPOTENCY_KEY_CONFLICT',
        'Idempotency-Key was already used for a different calculation operation.',
        409
      );
  }

  private toScannerFacts(facts: readonly FinancialFact[]): ScannerFact[] {
    return facts.map((fact) => ({
      key: fact.key,
      label: fact.label,
      value: fact.value,
      currency: fact.currency,
      scale: fact.scale,
      reportingPeriod: fact.reportingPeriod,
      classification: fact.classification,
      reviewStatus: fact.reviewStatus,
      verified: ['approved', 'reclassified'].includes(fact.reviewStatus),
      sensitivityCategory: fact.sensitivityCategory,
      sensitivityClassification: fact.sensitivityClassification
    }));
  }

  private detail(analysis: AnalysisDocument): AnalysisDetail {
    return {
      id: analysis._id.toString(),
      title: analysis.title,
      finalized: analysis.finalized,
      createdAt: analysis.createdAt.toISOString(),
      updatedAt: analysis.updatedAt.toISOString(),
      facts: analysis.facts.map((fact) => this.storedFact(fact)),
      assumptions: analysis.assumptions,
      calculationVersions: analysis.calculationVersions.map((version) => ({
        id: this.versionId(version),
        version: version.version,
        createdAt: version.createdAt.toISOString(),
        assumptions: version.assumptions,
        result: version.result
      }))
    };
  }
  private versionId(version: StoredCalculationVersion): string {
    if (version._id === undefined)
      throw new Error('Persisted calculation version is missing its identifier.');
    return version._id.toString();
  }
  private storedFact(fact: AnalysisDocument['facts'][number]): StoredFinancialFact {
    if (fact._id === undefined)
      throw new Error('Persisted financial fact is missing its identifier.');
    return {
      id: fact._id.toString(),
      key: fact.key,
      label: fact.label,
      value: fact.value,
      currency: fact.currency,
      scale: fact.scale,
      reportingPeriod: fact.reportingPeriod,
      classification: fact.classification,
      extractionMode: fact.extractionMode,
      sourcePage: fact.sourcePage,
      sourceChunkId: fact.sourceChunkId,
      evidenceText: fact.evidenceText,
      classificationReason: fact.classificationReason,
      reviewStatus: fact.reviewStatus,
      sensitivityCategory: fact.sensitivityCategory,
      sensitivityClassification: fact.sensitivityClassification
    };
  }
}
