import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform
} from '@nestjs/common';
import { z, type ZodType } from 'zod';

export interface ZodDto<T> {
  new (): T;
  readonly schema: ZodType<T>;
}

export function createZodDto<T>(schema: ZodType<T>): ZodDto<T> {
  return class {
    static readonly schema = schema;
  } as ZodDto<T>;
}

function schemaFor(metatype: unknown): ZodType<unknown> | undefined {
  if (typeof metatype !== 'function') return undefined;
  const candidate = metatype as { schema?: unknown };
  return candidate.schema instanceof z.ZodType ? candidate.schema : undefined;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = schemaFor(metadata.metatype);
    if (schema === undefined) return value;
    const result = schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        message: 'Request validation failed.',
        issues: result.error.issues
      });
    return result.data;
  }
}
