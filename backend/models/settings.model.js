import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    orderStartHour: {
      type: Number,
      default: 10,
      min: 0,
      max: 23,
    },
    orderStartMinute: {
      type: Number,
      default: 0,
      min: 0,
      max: 59,
    },
    orderEndHour: {
      type: Number,
      default: 1,
      min: 0,
      max: 23,
    },
    orderEndMinute: {
      type: Number,
      default: 0,
      min: 0,
      max: 59,
    },
    minimumOrderAmount: {
      type: Number,
      default: 250,
    },
    name: {
      type: String,
      default: "default",
      unique: true,
    },
    // Teslimat Noktaları
    deliveryPoints: {
      girlsDorm: {
        name: {
          type: String,
          default: "Kız KYK Yurdu"
        },
        enabled: {
          type: Boolean,
          default: true
        },
        startHour: {
          type: Number,
          default: 10,
          min: 0,
          max: 23
        },
        startMinute: {
          type: Number,
          default: 0,
          min: 0,
          max: 59
        },
        endHour: {
          type: Number,
          default: 1,
          min: 0,
          max: 23
        },
        endMinute: {
          type: Number,
          default: 0,
          min: 0,
          max: 59
        }
      },
      boysDorm: {
        name: {
          type: String,
          default: "Erkek KYK Yurdu"
        },
        enabled: {
          type: Boolean,
          default: true
        },
        startHour: {
          type: Number,
          default: 10,
          min: 0,
          max: 23
        },
        startMinute: {
          type: Number,
          default: 0,
          min: 0,
          max: 59
        },
        endHour: {
          type: Number,
          default: 1,
          min: 0,
          max: 23
        },
        endMinute: {
          type: Number,
          default: 0,
          min: 0,
          max: 59
        }
      }
    },
    // Uygulama Versiyon Ayarları (Tek versiyon hem Android hem iOS için)
    appVersion: {
      latestVersion: {
        type: String,
        default: "2.1.0"
      },
      minimumVersion: {
        type: String,
        default: "2.1.0"
      },
      forceUpdate: {
        type: Boolean,
        default: false
      },
      androidStoreUrl: {
        type: String,
        default: "https://play.google.com/store/apps/details?id=com.jupi.benimapp.benimmarketim_app"
      },
      iosStoreUrl: {
        type: String,
        default: "https://apps.apple.com/tr/app/benim-marketim/id6755792336?l=tr"
      }
    },
    // Sezonsal Tema Ayarları
    theme: {
      type: String,
      enum: ["normal", "newyear", "ramadan", "eid"],
      default: "normal"
    }
  },
  { timestamps: true }
);

// Varsayılan ayarları getiren statik metod
settingsSchema.statics.getSettings = async function () {
  const settings = await this.findOne({ name: "default" });
  if (settings) {
    return settings;
  }
  
  // Eğer ayarlar yoksa varsayılan değerlerle oluştur
  return await this.create({ name: "default" });
};

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings; 