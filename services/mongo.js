const mongoose = require("mongoose");

/**
 * @typedef {import("mongoose").Document} MongoDocument
 */

const url = process.env.MONGODB_URI;

console.log("connecting to KFLDB");

const connectKFLDB = async () => {
  try {
    await mongoose.connect(url);
    console.log("Connected to KFLDB");
  } catch (error) {
    console.log("XX error connecting to KFLDB: ", error.message);
  }
};

// (async () => {
//   await connectKFLDB();
// })();

exports.connectKFLDB = connectKFLDB;
