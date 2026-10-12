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

const productRoutes = express.Router();
// verifyToken,
productRoutes
  .route("/")
  .get(verifyToken, getAllProducts)
  .post(
    verifyToken,
    allowedRoles(ADMIN, MANAGER),
    upload.array("images", 4),
    addProduct,
  );

productRoutes
  .route("/:productId")
  .get(verifyToken, getProduct)
  .patch(
    verifyToken,
    allowedRoles(ADMIN, MANAGER),
    upload.array("images", 4),
    updateProduct,
  )
  .delete(verifyToken, allowedRoles(MANAGER, ADMIN), deleteProduct);

export { productRoutes };
