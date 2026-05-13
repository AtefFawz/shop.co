const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const { USER, ADMIN, MANAGER } = require("../utils/role");
const allowedRoles = require("../middlewares/allowedRoles");
const {
  deleteProduct,
  getProduct,
  updateProduct,
  addProduct,
  getAllProducts,
} = require("../controllers/productController");

const upload = require("../middlewares/multer");

const productRoutes = express.Router();

productRoutes
  .route("/")
  .get(verifyToken, getAllProducts)
  .post(
    verifyToken,
    allowedRoles(ADMIN, MANAGER),
    upload.single("photo"),
    addProduct,
  );

productRoutes
  .route("/:productId")
  .get(verifyToken, getProduct)
  .patch(
    verifyToken,
    allowedRoles(ADMIN, MANAGER),
    upload.single("photo"),
    updateProduct,
  )
  .delete(verifyToken, allowedRoles(MANAGER, ADMIN), deleteProduct);

module.exports = { productRoutes };
