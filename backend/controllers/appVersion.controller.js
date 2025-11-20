import AppVersion from "../models/appVersion.model.js";

// Versiyon bilgisini getir (Mobil uygulamanın kullanacağı endpoint)
export const getLatestVersion = async (req, res) => {
  try {
    // Varsayılan olarak Android versiyonunu getir
    // İsterseniz query parametresi ile platform ayrımı yapabilirsiniz: req.query.platform
    const platform = req.query.platform || "android";
    const version = await AppVersion.findOne({ platform });

    if (!version) {
      // Eğer veritabanında kayıt yoksa varsayılan bir değer döndür
      return res.status(200).json({
        minimumVersion: "1.0.0",
        latestVersion: "1.0.0",
        forceUpdate: false,
        updateMessage: "Güncel",
        storeUrl: "",
      });
    }

    res.status(200).json(version);
  } catch (error) {
    console.error("Version check error:", error);
    res.status(500).json({ message: "Sunucu hatası" });
  }
};

// Versiyon bilgisini oluştur/güncelle (Admin panelinden kullanılacak)
export const updateVersion = async (req, res) => {
  try {
    const {
      platform = "android",
      minimumVersion,
      latestVersion,
      forceUpdate,
      updateMessage,
      storeUrl,
    } = req.body;

    let version = await AppVersion.findOne({ platform });

    if (version) {
      // Güncelle
      if (minimumVersion !== undefined)
        version.minimumVersion = minimumVersion;
      if (latestVersion !== undefined) version.latestVersion = latestVersion;
      if (forceUpdate !== undefined) version.forceUpdate = forceUpdate;
      if (updateMessage !== undefined)
        version.updateMessage = updateMessage;
      if (storeUrl !== undefined) version.storeUrl = storeUrl;

      await version.save();
    } else {
      // Oluştur
      version = await AppVersion.create({
        platform,
        minimumVersion: minimumVersion || "1.0.0",
        latestVersion: latestVersion || "1.0.0",
        forceUpdate: forceUpdate !== undefined ? forceUpdate : false,
        updateMessage:
          updateMessage ||
          "Uygulamanızın yeni bir sürümü mevcut. Lütfen güncelleyin.",
        storeUrl: storeUrl || "",
      });
    }

    res.status(200).json(version);
  } catch (error) {
    console.error("Version update error:", error);
    res.status(500).json({ message: error.message });
  }
};

