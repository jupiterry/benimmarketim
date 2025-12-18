import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Check if running from backend folder or root
const currentDir = process.cwd();
console.log('Current Directory:', currentDir);

// Manual .env loading
try {
  dotenv.config({ path: path.join(currentDir, '.env') });
} catch (e) {
  console.log('Error loading .env from root, trying default loading...');
  dotenv.config();
}

const uri = process.env.MONGO_URI;
console.log('----------------------------------------');
console.log('MongoDB Connection Test Script');
console.log('----------------------------------------');

if (!uri) {
  console.error('❌ MONGO_URI is missing in .env');
  process.exit(1);
}

// Mask password for safe logging
const maskedUri = uri.replace(/:([^:@]{1,})@/, ':****@');
console.log(`Connecting to: ${maskedUri}`);

const testConnection = async () => {
  try {
    console.log('Attempting connection...');
    console.time('Connection Time');
    
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Short timeout for test
      socketTimeoutMS: 10000,
    });
    
    console.timeEnd('Connection Time');
    console.log('✅ Connected successfully!');
    console.log('Connection Host:', mongoose.connection.host);
    console.log('Connection Port:', mongoose.connection.port);
    console.log('Database Name:', mongoose.connection.name);
    console.log('Replica Set:', mongoose.connection.client.topology?.s?.options?.replicaSet || 'N/A');

    await mongoose.disconnect();
    console.log('Disconnected.');
    process.exit(0);
  } catch (error) {
    console.timeEnd('Connection Time');
    console.error('❌ Connection Failed!');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    
    if (error.reason && error.reason.servers) {
        console.log('\nTopology Details:');
        for (const [server, description] of error.reason.servers) {
            console.log(`- Server: ${server}`);
            console.log(`  Type: ${description.type}`);
            console.log(`  Error: ${description.error ? description.error.message : 'None'}`);
        }
    }
    
    if (error.message.includes('bad auth')) {
        console.log('\n👉 Check your Username and Password in MONGO_URI.');
    } else if (error.message.includes('timed out')) {
        console.log('\n👉 Still getting Time Out. Whitelist might not have applied yet OR DNS issue.');
    }
    
    process.exit(1);
  }
};

testConnection();
