import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as { message?: string | string[]; error?: string };

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message: exceptionResponse.message || 'An error occurred',
      error: exceptionResponse.error || 'Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
