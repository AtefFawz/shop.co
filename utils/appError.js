class appError extends Error {
  constructor() {
    super();
  }
  create(errorText, statusText, statusCode) {
    this.errorText = errorText;
    this.statusText = statusText;
    this.statusCode = statusCode;
    return this;
  }
}
module.exports = new appError();
