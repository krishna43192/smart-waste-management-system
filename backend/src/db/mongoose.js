const mongoose = require('mongoose');

// Establishes a resilient Mongoose connection using the URI supplied by the environment.
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}
module.exports = { connectDB };
