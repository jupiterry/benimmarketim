import mongoose from "mongoose";

export const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGO_URI, {
			serverSelectionTimeoutMS: 30000, // 30 saniye (varsayılan değer)
			socketTimeoutMS: 45000,
			family: 4 // IPv4 kullanmaya zorlar
		});
		console.log(`MongoDB connected: ${conn.connection.host}`);
	} catch (error) {
		console.log("Error connecting to MONGODB", error.message);
		process.exit(1);
	}
};
