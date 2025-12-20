// Debug script to check if coupons are being created properly
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const debugCoupons = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB'ye bağlandı");

    const db = mongoose.connection.db;

    // 1. Tüm kuponları listele
    const coupons = await db.collection("coupons").find({}).toArray();
    console.log("\n=== TÜM KUPONLAR ===");
    console.log(`Toplam kupon sayısı: ${coupons.length}`);
    
    coupons.forEach((c, i) => {
      console.log(`\n[${i + 1}] Kod: ${c.code}`);
      console.log(`    Açıklama: ${c.description}`);
      console.log(`    Tip: ${c.discountType} - %${c.discountPercentage || 0} / ₺${c.discountAmount || 0}`);
      console.log(`    UserId: ${c.userId || 'YOK (Genel)'}`);
      console.log(`    isReferralCoupon: ${c.isReferralCoupon || false}`);
      console.log(`    isActive: ${c.isActive}`);
      console.log(`    Bitiş: ${c.expirationDate}`);
    });

    // 2. Referral kuponlarını özellikle kontrol et
    const referralCoupons = coupons.filter(c => c.isReferralCoupon === true);
    console.log("\n=== REFERRAL KUPONLARI ===");
    console.log(`Referral kupon sayısı: ${referralCoupons.length}`);
    referralCoupons.forEach(c => {
      console.log(`- ${c.code}: UserId=${c.userId}, Aktif=${c.isActive}`);
    });

    // 3. Son kayıt olan kullanıcıları kontrol et
    const users = await db.collection("users")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    console.log("\n=== SON 5 KULLANICI ===");
    users.forEach(u => {
      console.log(`- ${u.name} (${u.email}): ID=${u._id}, Oluşturulma=${u.createdAt}`);
    });

    // 4. Referral kayıtlarını kontrol et
    const referrals = await db.collection("referrals").find({}).toArray();
    console.log("\n=== REFERRAL KAYITLARI ===");
    console.log(`Toplam referral sayısı: ${referrals.length}`);
    referrals.forEach(r => {
      console.log(`- Kod: ${r.referralCode}`);
      console.log(`  Referrer: ${r.referrer}`);
      console.log(`  Davet edilenler: ${r.referredUsers?.length || 0}`);
      if (r.referredUsers?.length > 0) {
        r.referredUsers.forEach(ru => {
          console.log(`    - User: ${ru.user}, Status: ${ru.status}`);
        });
      }
    });

    await mongoose.disconnect();
    console.log("\nBağlantı kapatıldı");
    process.exit(0);
  } catch (error) {
    console.error("Hata:", error);
    process.exit(1);
  }
};

debugCoupons();
