const mongoose = require("mongoose");

const ChromaProfile = require("../models/chromaprofile.js");

const url = process.env.MONGODB_URI;

console.log("connecting to KFLDB");

mongoose
  .connect(url)
  .then((result) => {
    console.log("connected to KFLDB");
  })
  .catch((error) => {
    console.log("error connecting to KFLDB:", error.message);
  });
