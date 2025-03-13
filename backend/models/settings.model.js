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