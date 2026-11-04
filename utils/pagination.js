const getPagination = (query = {}, defaults = {}) => {
  const defaultPage = defaults.page ?? 1;
  const defaultLimit = defaults.limit ?? 10;
  const maxLimit = defaults.maxLimit ?? 100;
  const maxPage = defaults.maxPage ?? 100000;

  const parsedPage = Number.parseInt(query.page, 10);
  const parsedLimit = Number.parseInt(query.limit, 10);

  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0
    ? Math.min(parsedPage, maxPage)
    : defaultPage;
  const requestedLimit =
    Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : defaultLimit;
  const limit = Math.min(requestedLimit, maxLimit);

  return { page, limit, skip: (page - 1) * limit };
};

export { getPagination };
