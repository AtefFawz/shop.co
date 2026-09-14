const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const appError = require("../utils/appError");
const { Fail } = require("../utils/httpText");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "shop-co-uploads",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
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
  storage: storage,
  fileFilter,
});

const getCloudinaryPublicId = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  if (!imageUrl.startsWith("http")) {
    return imageUrl.replace(/\.[^/.]+$/, "");
  }

  const regex = /\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/;
  const match = imageUrl.match(regex);

  return match ? match[1] : null;
};

module.exports = { upload, getCloudinaryPublicId, cloudinary };
