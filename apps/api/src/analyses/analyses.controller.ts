import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createAnalysisInputSchema,
  updateAnalysisAssumptionsSchema,
  updateAnalysisFactInputSchema
} from '@marxmatrix/contracts';
import { createZodDto } from '../common/zod-validation.pipe.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { AnalysesService } from './analyses.service.js';

class CreateAnalysisBody extends createZodDto(createAnalysisInputSchema) {}
class UpdateAnalysisFactBody extends createZodDto(updateAnalysisFactInputSchema) {}
class UpdateAssumptionsBody extends createZodDto(updateAnalysisAssumptionsSchema) {}
@Controller('analyses')
@UseGuards(AuthGuard)
export class AnalysesController {
  public constructor(private readonly analyses: AnalysesService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateAnalysisBody,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.analyses.create(user.id, body, idempotencyKey);
  }
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.analyses.list(user.id);
  }
  @Get(':id/versions') versions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.analyses.versions(user.id, id);
  }
  @Get(':id') find(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.analyses.find(user.id, id);
  }
  @Patch(':id/facts/:factId') updateFact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('factId') factId: string,
    @Body() body: UpdateAnalysisFactBody
  ) {
    return this.analyses.updateFact(user.id, id, factId, body);
  }
  @Patch(':id/assumptions') updateAssumptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateAssumptionsBody
  ) {
    return this.analyses.updateAssumptions(user.id, id, body);
  }
  @Post(':id/calculate') calculate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.analyses.calculate(user.id, id, false, idempotencyKey);
  }
  @Post(':id/finalize') finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.analyses.calculate(user.id, id, true, idempotencyKey);
  }
}
