ر# ⚙️ Shop-co | RESTful API Service

The robust backend engine powering the Shop-co e-commerce platform. Built with **Node.js**, **Express**, and **MongoDB**, optimized for serverless deployment on Vercel.

## 🔑 Key Features
- **JWT Authentication:** Secure user sessions and role-based access.
- **Cloudinary Integration:** Direct image uploads for products and user profiles.
- **Optimized DB Connections:** Implemented Singleton pattern for MongoDB to handle Vercel's serverless timeouts.
- **Global Error Middleware:** Centralized handling for all API errors.
- **CORS Enabled:** Secure communication with the frontend.

## 🛠️ Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (via Mongoose)
- **Storage:** Cloudinary API
- **Auth:** JSON Web Tokens (JWT) & Bcrypt
- **Deployment:** Vercel Functions

## 📡 API Endpoints (Quick Look)
- `POST /api/user/signup` - Register a new user
- `POST /api/user/signin` - User login
- `GET /api/product` - Fetch all products (with search/filter)
- `GET /api/profile/me` - Get current user data (Protected)

## 🔧 Installation
1. Clone the repo: `git clone <your-repo-url>`
2. Install dependencies: `npm install`
3. Configure `.env` file:
   `URL=your_mongodb_uri`
   `JWT_SECRET=your_secret_key`
   `CLOUD_NAME=your_cloudinary_name`
