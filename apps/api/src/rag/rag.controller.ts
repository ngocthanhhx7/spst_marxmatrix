import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { courseIdSchema, ragQuerySchema } from '@marxmatrix/contracts';
import { z } from 'zod';
import { createZodDto } from '../common/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../identity/authenticated-user.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentUser } from '../identity/current-user.decorator.js';
import { RagService } from './rag.service.js';
import { MongoCourseCorpusScopeResolver } from './course-corpus-scope.resolver.js';

class RagQueryBody extends createZodDto(ragQuerySchema) {}
class RagDocumentsQuery extends createZodDto(z.object({ courseId: courseIdSchema })) {}

@Controller('rag')
@UseGuards(AuthGuard)
export class RagController {
  public constructor(
    private readonly rag: RagService,
    private readonly corpus: MongoCourseCorpusScopeResolver
  ) {}

  @Get('documents')
  documents(@Query() query: RagDocumentsQuery) {
    return this.corpus.eligibleDocuments(query['courseId']);
  }

  @Get('documents/:id/pages/:pageNumber')
  page(
    @Param('id') id: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @Query() query: RagDocumentsQuery
  ) {
    return this.corpus.page(id, pageNumber, query['courseId']);
  }

  @Post('query')
  query(@CurrentUser() user: AuthenticatedUser, @Body() body: RagQueryBody) {
    return this.rag.query(user.id, body);
  }
}
