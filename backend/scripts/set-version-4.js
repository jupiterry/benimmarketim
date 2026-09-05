import 'dotenv/config';
import mongoose from 'mongoose';
import Settings from '../models/settings.model.js';

// Run on the deployment host: node backend/scripts/set-version-4.js
// Release 4.0.0+40: mobile version comparisons use the version without build metadata.
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const settings = await Settings.findOneAndUpdate(
    { name: 'default' },
    { $set: {
      'appVersion.latestVersion': '4.0.3',
      'appVersion.minimumVersion': '4.0.3',
      'appVersion.forceUpdate': true,
    } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  console.log(JSON.stringify(settings.appVersion));
} catch {
  console.error('Versiyon güncellenemedi. Sunucunun MongoDB bağlantısını kontrol edin.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
