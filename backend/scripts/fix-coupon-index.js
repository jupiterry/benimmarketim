// Script to drop the problematic userId index from coupons collection
// Run this once to fix the duplicate key error

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const fixCouponIndex = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB'ye bağlandı");

    const db = mongoose.connection.db;
    const collection = db.collection("coupons");

    // Mevcut index'leri listele
    const indexes = await collection.indexes();
    console.log("Mevcut index'ler:", indexes);

    // userId_1 index'ini bul ve sil
    const userIdIndex = indexes.find(idx => idx.name === "userId_1");
    if (userIdIndex) {
      console.log("userId_1 index'i bulundu, siliniyor...");
      await collection.dropIndex("userId_1");
      console.log("userId_1 index'i başarıyla silindi!");
    } else {
      console.log("userId_1 index'i bulunamadı (zaten silinmiş olabilir)");
    }

    // Yeni güncellemeler sonrası index'leri göster
    const newIndexes = await collection.indexes();
    console.log("Güncel index'ler:", newIndexes);

    await mongoose.disconnect();
    console.log("Bağlantı kapatıldı");
    process.exit(0);
  } catch (error) {
    console.error("Hata:", error);
    process.exit(1);
  }
};

fixCouponIndex();
