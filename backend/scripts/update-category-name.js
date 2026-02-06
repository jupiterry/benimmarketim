import dotenv from "dotenv";
import mongoose from "mongoose";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function updateCategoryName() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB'ye bağlandı");

        const db = mongoose.connection.db;

        // Kategoriler koleksiyonunda güncelleme yap
        const result = await db.collection("products").updateMany(
            { category: "Golf Dondurmalar" },
            { $set: { category: "Dondurmalar" } }
        );

        console.log(`${result.modifiedCount} ürün güncellendi`);

        await mongoose.disconnect();
        console.log("Bağlantı kapatıldı");
    } catch (error) {
        console.error("Hata:", error);
        process.exit(1);
    }
}

updateCategoryName();
