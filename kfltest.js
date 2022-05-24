require("dotenv").config();
// const express = require("express");
// const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
// const mongo = require("./services/mongo.js");
// const { ScrapePushshift } = require("./pushshift-scraper");
// const { ProcessNewRedditPosts } = require("./reddit-scraper");

const url = process.env.MONGODB_URI;

const connectKFLDB = async () => {
  try {
    await mongoose.connect(url);
    console.log("Connected to KFLDB");
  } catch (error) {
    console.log("XX error connecting to KFLDB: ", error.message);
  }
};

const Redditpost = require("./models/redditpost");

const Fix_scraped_utc = async () => {
  const posts = await Redditpost.find({});

  for (post of posts) {
    if (post.scraped_utc) {
      post.scraped_utc = Math.floor(post.scraped_utc);
      await post.save();
      console.log(`updated ${post.title} to ${post.scraped_utc}`);
    }
  }
};

const Main = async () => {
  await connectKFLDB();
  await Fix_scraped_utc();
  console.log("********* Done Math.floor() **********");
};

Main();
