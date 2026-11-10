import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = this.publicMessage(exception, status);

    this.logger.error(
      JSON.stringify({
        statusCode: status,
        method: request.method,
        path: request.url,
        exception: exception instanceof Error ? exception.name : 'UnknownError',
      }),
    );

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (this.isHealthBody(body)) {
        response.status(status).json(body);
        return;
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private publicMessage(exception: unknown, status: number): string | string[] {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Internal server error';
    }
    if (!(exception instanceof HttpException)) {
      return 'Request failed';
    }
    const body = exception.getResponse();
    if (typeof body === 'string') {
      return body;
    }
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' || Array.isArray(message)) {
        return message as string | string[];
      }
    }
    return exception.message;
  }

  private isHealthBody(body: unknown): body is Record<string, unknown> {
    return (
      typeof body === 'object' &&
      body !== null &&
      'status' in body &&
      'details' in body &&
      'info' in body
    );
  }
}
