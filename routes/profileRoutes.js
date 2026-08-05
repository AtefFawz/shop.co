const express = require("express");
const { getMe, updateUser } = require("../controllers/profileController");
const verifyToken = require("../middlewares/verifyToken");
const upload = require("../middlewares/multer");
const profileRouts = express.Router();
profileRouts.use(verifyToken);
profileRouts.get("/me", getMe);
profileRouts.patch("/me/update", upload.single("avatar"), updateUser);

module.exports = { profileRouts };
