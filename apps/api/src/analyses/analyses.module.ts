import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import {
  DocumentPageRecord,
  DocumentPageRecordSchema
} from '../documents/schemas/document-page.schema.js';
import { DocumentRecord, DocumentRecordSchema } from '../documents/schemas/document.schema.js';
import { AnalysesController } from './analyses.controller.js';
import { AnalysesService } from './analyses.service.js';
import { CalculationService } from './domain/calculation.service.js';
import { ExtractFinancialsHandler } from './extract-financials.handler.js';
import { EXTRACTION_LOGGER, FinancialExtractionService } from './financial-extraction.service.js';
import { Analysis, AnalysisSchema } from './schemas/analysis.schema.js';

@Module({
  imports: [
    IdentityModule,
    AiModule,
    JobsModule,
    MongooseModule.forFeature([
      { name: Analysis.name, schema: AnalysisSchema },
      { name: DocumentRecord.name, schema: DocumentRecordSchema },
      { name: DocumentPageRecord.name, schema: DocumentPageRecordSchema }
    ])
  ],
  controllers: [AnalysesController],
  providers: [
    AnalysesService,
    CalculationService,
    FinancialExtractionService,
    ExtractFinancialsHandler,
    {
      provide: EXTRACTION_LOGGER,
      useFactory: () => new Logger(FinancialExtractionService.name)
    }
  ],
  exports: [FinancialExtractionService]
})
export class AnalysesModule {}
