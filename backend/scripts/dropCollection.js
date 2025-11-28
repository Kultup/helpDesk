const mongoose = require('mongoose');
require('dotenv').config();

const collectionName = process.argv[2];

if (!collectionName) {
  console.error('Collection name is required');
  process.exit(1);
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    console.log(`Collection "${collectionName}" not found`);
    await mongoose.disconnect();
    process.exit(0);
  }
  await db.collection(collectionName).drop();
  console.log(`Collection "${collectionName}" dropped`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err && err.message ? err.message : err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

