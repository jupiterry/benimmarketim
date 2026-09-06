export const siteUrl = "https://devrekbenimmarketim.com";
export const homeTitle = "Devrek Benim Marketim - Online Alışveriş";
export const homeDescription = "Devrek Benim Marketim - En kaliteli ürünler, uygun fiyatlar ve hızlı teslimat ile online alışverişin adresi. Devrek'te güvenilir market hizmeti.";
export const homeKeywords = "devrek market, online market, süpermarket, gıda, içecek, temizlik ürünleri, kişisel bakım, devrek alışveriş, benim marketim";

// Preserve the storefront's original category names and URLs.
export const marketCategories = [
  ["kahve", "Benim Kahvem", "kahve.png", "Kahve molaların için seçenekleri uygulamada incele; güncel ürünleri ve fiyatları sipariş öncesinde gör."],
  ["yiyecekler", "Yiyecekler", "foods.png", "Öğünlerin ve günlük ihtiyaçların için yiyecek seçeneklerini mobil uygulamada keşfet."],
  ["kahvalti", "Kahvaltılık Ürünler", "kahvalti.png", "Kahvaltı sofranı hazırlarken ihtiyaç duyduğun ürünleri bir arada incele ve sepetini uygulamada oluştur."],
  ["gida", "Temel Gıda", "basic.png", "Mutfağın günlük ihtiyaçları için temel gıda seçeneklerini incele; alışveriş listeni uygulamadan tamamla."],
  ["meyve-sebze", "Meyve & Sebze", "fruit.png", "Meyve ve sebze alışverişinde o gün sunulan seçenekleri mobil uygulamadan kontrol edebilirsin."],
  ["sut", "Süt & Süt Ürünleri", "milk.png", "Kahvaltıdan yemek hazırlığına kadar kullandığın süt ve süt ürünlerini uygulamada bulabilirsin."],
  ["bespara", "Beş Para Etmeyen Ürünler", "bespara.png", "Bu özel kategoride sunulan ürünleri ve güncel fiyatlarını Benim Marketim uygulamasından inceleyebilirsin."],
  ["tozicecekler", "Toz İçecekler", "instant.png", "Pratik içecek hazırlamak için toz içecek çeşitlerini uygulamada incele; mevcut seçeneklerden siparişini oluştur."],
  ["cips", "Cips & Çerez", "dd.png", "Film akşamları ve molalar için cips ve çerez seçeneklerini mobil uygulamada keşfet."],
  ["cayseker", "Çay ve Şekerler", "cay.png", "Çay saatinin ihtiyaçlarını bir araya getir; çay ve şeker seçeneklerini uygulamada karşılaştır."],
  ["atistirma", "Atıştırmalıklar", "atistirmaa.png", "Gün içindeki molaların için atıştırmalık çeşitlerini keşfet ve seçimini uygulamada yap."],
  ["temizlik", "Temizlik & Hijyen", "clean.png", "Ev temizliği ve günlük hijyen ihtiyaçların için ürünleri uygulamadan inceleyebilirsin."],
  ["kisisel", "Kişisel Bakım", "care.png", "Günlük bakım rutininde kullandığın kişisel bakım ürünlerini market alışverişine ekle."],
  ["makarna", "Makarna ve Kuru Bakliyat", "makarna.png", "Öğünlerini planlarken makarna ve kuru bakliyat seçeneklerini uygulamadan incele."],
  ["et", "Şarküteri & Et Ürünleri", "chicken.png", "Kahvaltı ve yemek hazırlığın için şarküteri ve et ürünlerinin güncel seçeneklerini uygulamadan kontrol et."],
  ["icecekler", "Buz Gibi İçecekler", "juice.png", "Sofrana veya molana eşlik edecek içecek çeşitlerini uygulamada keşfet."],
  ["dondurulmus", "Dondurulmuş Gıdalar", "frozen.png", "Pratik yemek hazırlığı için dondurulmuş gıda seçeneklerini incele ve siparişini uygulamadan tamamla."],
  ["baharat", "Baharatlar", "spices.png", "Yemeklerine lezzet katacak baharat seçeneklerini mobil uygulamadan inceleyebilirsin."],
  ["dondurma", "Dondurmalar", "dondurma.png", "Tatlı molası için dondurma çeşitlerini uygulamadan keşfet ve mevcut ürünleri kontrol et."],
].map(([slug, name, image, description]) => ({ slug, name, image, description, path: `/category/${slug}` }));

export const publicPages = ["/", "/about", "/contact", "/faq", "/privacy", "/terms", "/distance-sales", "/return-policy", "/cookies", "/kvkk", "/hesap-silme"];
