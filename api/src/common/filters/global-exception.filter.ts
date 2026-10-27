import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Error interno del servidor';
    let errors: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      const body =
        res && typeof res === 'object'
          ? (res as Record<string, unknown>)
          : undefined;

      message = typeof res === 'string' ? res : body?.message || message;

      // `ZodValidationPipe` adjunta el detalle por campo en `errors`. Antes se
      // perdia aqui y el frontend solo podia mostrar un mensaje generico.
      if (Array.isArray(body?.errors)) errors = body.errors;
    } else {
      this.logger.error(
        'Error no manejado',
        exception instanceof Error ? exception.stack : '',
      );
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      message: (Array.isArray(message) ? message[0] : message) as string,
    };
    if (errors) payload.errors = errors;

    response.status(status).json(payload);
  }
}
