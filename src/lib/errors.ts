export type ErrorShape = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const formatError = (err: AppError): ErrorShape => ({
  error: {
    code: err.code,
    message: err.message,
    details: err.details
  }
});
