import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument, Types } from 'mongoose';
import type { FinancialExtractionResult, FinancialFact } from '@marxmatrix/contracts';

export type AnalysisDocument = HydratedDocument<Analysis>;

@Schema({ versionKey: false })
export class StoredFact {
  _id?: Types.ObjectId;
  @Prop({ required: true }) key!: string;
  @Prop({ required: true }) label!: string;
  @Prop({ required: true }) value!: number;
  @Prop({ required: true }) currency!: string;
  @Prop({ type: String, required: true, enum: ['ones', 'thousands', 'millions', 'billions'] })
  scale!: FinancialFact['scale'];
  @Prop({ required: true }) reportingPeriod!: string;
  @Prop({
    type: String,
    required: true,
    enum: [
      'revenue',
      'constant_capital',
      'variable_capital',
      'surplus_proxy',
      'excluded',
      'needs_review'
    ]
  })
  classification!: FinancialFact['classification'];
  @Prop({ type: String, required: true, enum: ['manual', 'ai_extracted', 'imported'] })
  extractionMode!: FinancialFact['extractionMode'];
  @Prop({ type: Number, default: null }) sourcePage!: number | null;
  @Prop({ type: String, default: null }) sourceChunkId!: string | null;
  @Prop({ type: String, default: null }) evidenceText!: string | null;
  @Prop({ required: true }) classificationReason!: string;
  @Prop({
    type: String,
    required: true,
    enum: ['pending_review', 'approved', 'rejected', 'reclassified']
  })
  reviewStatus!: FinancialFact['reviewStatus'];
  @Prop({
    type: String,
    required: true,
    default: 'standard',
    enum: ['standard', 'contractor', 'stock_compensation']
  })
  sensitivityCategory!: FinancialFact['sensitivityCategory'];
  @Prop({
    type: String,
    default: null,
    enum: ['revenue', 'constant_capital', 'variable_capital', 'surplus_proxy', 'excluded']
  })
  sensitivityClassification!: FinancialFact['sensitivityClassification'];
}
export const StoredFactSchema = SchemaFactory.createForClass(StoredFact);

@Schema({ _id: false, versionKey: false })
export class StoredAssumptions {
  @Prop({ required: true }) revenueAdjustment!: number;
  @Prop({ required: true }) includeSurplusProxy!: boolean;
  @Prop({
    required: true,
    default: 'constant_capital',
    enum: ['constant_capital', 'variable_capital']
  })
  contractorClassification!: 'constant_capital' | 'variable_capital';
  @Prop({ required: true, default: false }) includeStockCompensation!: boolean;
  @Prop({ required: true, default: false }) includeNeedsReview!: boolean;
  @Prop({ default: '' }) notes!: string;
}
export const StoredAssumptionsSchema = SchemaFactory.createForClass(StoredAssumptions);

@Schema({ _id: false, versionKey: false })
export class StoredCalculationResult {
  @Prop({ required: true }) constantCapital!: number;
  @Prop({ required: true }) variableCapital!: number;
  @Prop({ required: true }) adjustedRevenue!: number;
  @Prop({ required: true }) surplusValue!: number;
  @Prop({ required: true }) surplusValueRate!: number;
  @Prop({ required: true }) organicComposition!: number;
  @Prop({ required: true }) profitRate!: number;
  @Prop({ required: true, min: 0, max: 100 }) evidenceCoverage!: number;
}
export const StoredCalculationResultSchema = SchemaFactory.createForClass(StoredCalculationResult);

@Schema({ versionKey: false })
export class StoredCalculationVersion {
  _id?: Types.ObjectId;
  @Prop({ required: true }) idempotencyKey!: string;
  @Prop({ required: true, enum: ['calculate', 'finalize'] })
  operation!: 'calculate' | 'finalize';
  @Prop({ required: true }) version!: number;
  @Prop({ required: true }) createdAt!: Date;
  @Prop({ type: StoredAssumptionsSchema, required: true }) assumptions!: StoredAssumptions;
  @Prop({ type: StoredCalculationResultSchema, required: true }) result!: StoredCalculationResult;
}
export const StoredCalculationVersionSchema =
  SchemaFactory.createForClass(StoredCalculationVersion);

@Schema({ timestamps: true, versionKey: false })
export class Analysis {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;
  @Prop({ type: String, required: false }) createIdempotencyKey?: string;
  @Prop({ type: String, required: false }) createRequestFingerprint?: string;
  @Prop({ required: true, trim: true, maxlength: 200 }) title!: string;
  @Prop({ type: [StoredFactSchema], required: true, default: [] }) facts!: StoredFact[];
  @Prop({ type: StoredAssumptionsSchema, required: true }) assumptions!: StoredAssumptions;
  @Prop({ type: [StoredCalculationVersionSchema], required: true, default: [] })
  calculationVersions!: StoredCalculationVersion[];
  @Prop({ required: true, default: false, index: true }) finalized!: boolean;
  @Prop({ required: true, default: 0, min: 0 }) stateVersion!: number;
  @Prop({ required: true, default: 1, min: 1 }) nextCalculationVersion!: number;
  /** Completed source fingerprint makes repeated/reclassified extraction idempotent. */
  @Prop({ type: String, default: null, select: false }) financialExtractionFingerprint!:
    | string
    | null;
  /** Short-lived claim prevents two leased jobs from issuing the same model request. */
  @Prop({ type: String, default: null, select: false })
  financialExtractionInProgressFingerprint!: string | null;
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null, select: false, index: true })
  financialExtractionDocumentId!: Types.ObjectId | null;
  @Prop({ type: Boolean, default: null, select: false }) financialExtractionSimulated!:
    | boolean
    | null;
  @Prop({ type: String, default: null, select: false }) financialExtractionModel!: string | null;
  @Prop({ type: String, default: null, select: false }) financialExtractionPromptVersion!:
    | string
    | null;
  @Prop({ type: String, default: null, select: false })
  financialExtractionParseToken!: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null, select: false })
  financialExtractionUsage!: FinancialExtractionResult['usage'] | null;
  createdAt!: Date;
  updatedAt!: Date;
}
export const AnalysisSchema = SchemaFactory.createForClass(Analysis);
AnalysisSchema.index({ ownerId: 1, updatedAt: -1 });
AnalysisSchema.index({ ownerId: 1, financialExtractionDocumentId: 1 });
AnalysisSchema.index(
  { ownerId: 1, createIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { createIdempotencyKey: { $type: 'string' } }
  }
);
