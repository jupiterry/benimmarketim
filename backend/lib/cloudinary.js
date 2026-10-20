import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary secure_url'den public_id çıkarır: .../upload/v123/avatars/abc.jpg → avatars/abc
export const publicIdFromUrl = (url) => {
	if (typeof url !== "string") return null;
	const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+$/);
	return match ? match[1] : null;
};

export default cloudinary;
