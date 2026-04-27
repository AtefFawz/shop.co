const express = require("express");
const { getMe } = require("../controllers/profileController");
const verifyToken = require("../middlewares/verifyToken");
const profileRouts = express.Router();
profileRouts.use(verifyToken);
profileRouts.get("/me", getMe);

module.exports = { profileRouts };
