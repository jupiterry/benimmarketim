import mongoose from "mongoose";

export const DEFAULT_AI_MODEL = "google/gemma-4-26b-a4b-it:free";
const LEGACY_AI_MODEL = "openai/gpt-4o";

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
        default: "4.0.3"
      },
      minimumVersion: {
        type: String,
        default: "4.0.3"
      },
      forceUpdate: {
        type: Boolean,
        default: true
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
    ai: {
      enabled: { type: Boolean, default: true },
      provider: { type: String, enum: ["groq", "openrouter", "gemini"], default: () => process.env.AI_DEFAULT_PROVIDER || "openrouter" },
      model: { type: String, default: () => process.env.AI_DEFAULT_MODEL || DEFAULT_AI_MODEL },
      maxHistoryMessages: { type: Number, default: 12, min: 2, max: 30 },
    }
  },
  { timestamps: true }
);

// Varsayılan ayarları getiren statik metod
export const migrateLegacyAiModel = async (settings) => {
  if (settings.ai?.provider === "openrouter" && settings.ai.model === LEGACY_AI_MODEL) {
    settings.ai.model = DEFAULT_AI_MODEL;
    await settings.save();
  }
  return settings;
};

settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ name: "default" });
  if (!settings) settings = await this.create({ name: "default" });
  return migrateLegacyAiModel(settings);
};

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
