class AppError extends Error {
  constructor(errorText, statusText = "error", statusCode = 500) {
    super(errorText);
    this.name = "AppError";
    this.errorText = errorText;
    this.statusText = statusText;
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }

  create(errorText, statusText, statusCode) {
    return new AppError(errorText, statusText, statusCode);
  }
}

export default new AppError();
