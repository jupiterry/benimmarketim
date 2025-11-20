import mongoose from "mongoose";

const appVersionSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: ["android", "ios"],
      default: "android",
    },
    minimumVersion: {
      type: String,
      required: true,
      default: "1.0.0",
    },
    latestVersion: {
      type: String,
      required: true,
      default: "1.0.0",
    },
    forceUpdate: {
      type: Boolean,
      default: false,
    },
    updateMessage: {
      type: String,
      default: "Uygulamanızın yeni bir sürümü mevcut. Lütfen güncelleyin.",
    },
    storeUrl: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const AppVersion = mongoose.model("AppVersion", appVersionSchema);

export default AppVersion;

