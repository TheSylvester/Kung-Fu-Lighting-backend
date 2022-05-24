const mongoose = require("mongoose");

const url = process.env.MONGODB_URI;

console.log("connecting to KFLDB");

// mongoose
//   .connect(url)
//   .then((result) => {
//     console.log("connected to KFLDB");
//   })
//   .catch((error) => {
//     console.log("error connecting to KFLDB:", error.message);
//   });

const connectKFLDB = async () => {
  try {
    await mongoose.connect(url);
    console.log("Connected to KFLDB");
  } catch (error) {
    console.log("XX error connecting to KFLDB: ", error.message);
  }
};

(async () => {
  await connectKFLDB();
})();
