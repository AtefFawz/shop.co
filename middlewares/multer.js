const multer = require("multer");
const appError = require("../utils/appError");
const { Fail } = require("../utils/httpText");

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split("/")[1];
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = `photo-${uniqueSuffix}.${ext}`;
    cb(null, fileName);
  },
});
const fileFilter = (req, file, cb) => {
  const imageType = file.mimetype.split("/")[0];
  if (imageType === "image") {
    return cb(null, true);
  } else {
    return cb(appError.create("File must be an image", Fail, 400), false);
  }
};
const upload = multer({
  storage: diskStorage,
  fileFilter,
});
module.exports = upload;
