import multer from "multer";
import { PassThrough } from "stream";
import { v2 as cloudinary } from "cloudinary";
import appError from "../utils/appError.js";
import { Fail } from "../utils/httpText.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const MIME_SIGNATURES = {
  "image/jpeg": (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  "image/png": (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (buffer) => buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP",
};

const parser = multer({
  storage: multer.memoryStorage(),
  fileFilter(req, file, cb) {
    if (!Object.hasOwn(MIME_SIGNATURES, file.mimetype)) {
      return cb(appError.create("File must be a supported image (JPEG, PNG, or WebP)", Fail, 400));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4,
    fields: 40,
    fieldSize: 100 * 1024,
    fieldNameSize: 100,
    parts: 45,
    // Product uploads use flat fields; deeply nested multipart field names
    // are unnecessary and can consume excessive CPU/memory.
    fieldNestingDepth: 2,
    headerPairs: 100,
  },
});

const uploadBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "shop-co-uploads",
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    const input = new PassThrough();
    input.end(buffer);
    input.pipe(stream);
  });

const createUploadMiddleware = (parseRequest) => (req, res, next) => {
  parseRequest(req, res, async (parseError) => {
    if (parseError) return next(parseError);

    const files = req.file ? [req.file] : (req.files || []);
    if (!files.length) return next();

    const uploaded = [];
    try {
      for (const file of files) {
        const signatureMatches = MIME_SIGNATURES[file.mimetype]?.(file.buffer);
        if (!signatureMatches) {
          throw appError.create("File must be a supported image (JPEG, PNG, or WebP)", Fail, 400);
        }
        const result = await uploadBuffer(file.buffer);
        file.path = result.secure_url;
        file.filename = result.public_id;
        file.public_id = result.public_id;
        file.mimetype = `image/${result.format === "jpg" ? "jpeg" : result.format}`;
        delete file.buffer;
        uploaded.push(result.public_id);
      }
      req.uploadedCloudinaryIds = uploaded;
      // Controllers run after this middleware. If validation or persistence fails,
      // remove the just-uploaded assets after the final error response is sent.
      res.once("finish", () => {
        if (res.statusCode >= 400 && uploaded.length) {
          Promise.allSettled(uploaded.map((publicId) => cloudinary.uploader.destroy(publicId)))
            .then((results) => {
              const failures = results.filter((result) => result.status === "rejected").length;
              if (failures) console.warn(`Could not clean up ${failures} rejected upload(s).`);
            });
        }
      });
      next();
    } catch (error) {
      await Promise.allSettled(uploaded.map((publicId) => cloudinary.uploader.destroy(publicId)));
      next(error);
    }
  });
};

const upload = {
  single(fieldName) {
    return createUploadMiddleware(parser.single(fieldName));
  },
  array(fieldName, maxCount = 4) {
    return createUploadMiddleware(parser.array(fieldName, Math.min(maxCount, 4)));
  },
};

const getCloudinaryPublicId = (imageUrl) => {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) return null;

  try {
    if (!imageUrl.startsWith("http")) {
      const cleanId = imageUrl.replace(/^\/+/, "").replace(/\.[^/.]+$/, "");
      return cleanId.startsWith("shop-co-uploads/") ? cleanId : null;
    }

    const parsed = new URL(imageUrl);
    if (parsed.hostname !== "res.cloudinary.com") return null;
    const uploadIndex = parsed.pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    const parts = parsed.pathname.slice(uploadIndex + 8).split("/").filter(Boolean);
    const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
    const publicParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts;
    if (!publicParts.length) return null;

    const lastIndex = publicParts.length - 1;
    publicParts[lastIndex] = publicParts[lastIndex].replace(/\.[a-zA-Z0-9]+$/, "");
    const publicId = publicParts.join("/");
    return publicId.startsWith("shop-co-uploads/") ? publicId : null;
  } catch {
    return null;
  }
};

export { upload, getCloudinaryPublicId, cloudinary };
