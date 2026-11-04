import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { ADMIN, MANAGER } from "../utils/role.js";
import allowedRoles from "../middlewares/allowedRoles.js";
import {
  deleteProduct,
  getProduct,
  updateProduct,
  addProduct,
  getAllProducts,
} from "../controllers/productController.js";

import { upload } from "../middlewares/multer.js";
import { createRateLimit } from "../middlewares/rateLimit.js";

const productUploadLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  namespace: "product-upload",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || req.ip || "unknown"}`,
});
const productDeleteLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  namespace: "product-delete",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || "unknown"}`,
});
const catalogReadLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 300,
  namespace: "public-catalog-read",
  store: "mongo",
});

const productRoutes = express.Router();
productRoutes
  .route("/")
  .get(catalogReadLimiter, getAllProducts)
  .post(
    verifyToken,
    allowedRoles(ADMIN, MANAGER),
    productUploadLimiter,
    upload.array("images", 4),
    addProduct,
  );

productRoutes
  .route("/:productId")
  .get(catalogReadLimiter, getProduct)
  .patch(
    verifyToken,
    allowedRoles(ADMIN, MANAGER),
    productUploadLimiter,
    upload.array("images", 4),
    updateProduct,
  )
  .delete(verifyToken, allowedRoles(MANAGER, ADMIN), productDeleteLimiter, deleteProduct);

export { productRoutes };
