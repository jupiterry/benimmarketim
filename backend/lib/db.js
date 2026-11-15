import mongoose from "mongoose";

export const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGO_URI, {
			serverSelectionTimeoutMS: 30000, // 30 saniye (varsayılan değer)
			socketTimeoutMS: 45000,
		});
		console.log(`MongoDB connected: ${conn.connection.host}`);
		// Tek seferlik veri düzeltmesi: gün olarak girilmiş kuponlar o günün sonuna kadar geçerli olsun
		import("../services/coupon.service.js")
			.then(({ fixMidnightCouponExpiries }) => fixMidnightCouponExpiries())
			.then((fixed) => { if (fixed) console.log(`Kupon bitişi günün sonuna çekildi: ${fixed} kupon`); })
			.catch((error) => console.error("Kupon bitiş düzeltmesi çalışmadı:", error.message));
	} catch (error) {
		console.log("Error connecting to MONGODB", error.message);
		process.exit(1);
	}
};
