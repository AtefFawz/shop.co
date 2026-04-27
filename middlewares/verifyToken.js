const jwt = require("jsonwebtoken");
const appError = require("../utils/appError");
const { Fail } = require("../utils/httpText");

const verifyToken = (req, res, next) => {
  // 1- Get the "Authorization" header from the request
  const authHeader =
    req.headers["Authorization"] || req.headers["authorization"];

  // 2- If no header is found, return an error (Stop here)
  if (!authHeader) {
    return next(appError.create("Token is required", Fail, 401));
  }

  // 3- Split the string "Bearer <token>" and take only the token part
  const token = authHeader.split(" ")[1];

  try {
    // 4- Check if the token is valid using our Secret Key
    const currentUser = jwt.verify(token, process.env.SECRET_KEY);

    // 5- Save user data inside the "request" to use it in the next step
    req.currentUser = currentUser;

    // 6- Everything is OK, go to the Controller
    next();
  } catch (error) {
    // 7- If the token is wrong or expired, return an error
    return next(appError.create(`Invalid Token  ${error}`, Fail, 401));
  }
};

module.exports = verifyToken;
