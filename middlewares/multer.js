const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const appError = require("../utils/appError");
const { Fail } = require("../utils/httpText");

// 1. إعدادات Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. إعداد المخزن السحابي (ده اللي Vercel بيحبه)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "shop-co-uploads",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    // Cloudinary بيتعامل مع اسم الملف أوتوماتيك فمش محتاجين دوشة Date.now()
  },
});

// 3. فلتر الصور (عشان نضمن إن محدش يرفع ملف PDF مثلاً)
const fileFilter = (req, file, cb) => {
  const imageType = file.mimetype.split("/")[0];
  if (imageType === "image") {
    return cb(null, true);
  } else {
    return cb(appError.create("File must be an image", Fail, 400), false);
  }
};

// 4. هنا اللعبة: نستخدم الـ storage بتاع Cloudinary
const upload = multer({
  storage: storage, // 🎯 غيرنا دي من diskStorage لـ storage
  fileFilter,
});

module.exports = upload;
