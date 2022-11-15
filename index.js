if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const cors = require("cors");
const { connectKFLDB } = require("./services/mongo.js");
const cookieParser = require("cookie-parser");

// environmental variables
const PORT = process.env.PORT;

(async () => {
  await connectKFLDB();
})();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("build"));

// routes
const apiRouter = require("./routes/api");
const oauthRouter = require("./routes/oauth");

app.use("/api/", apiRouter);
app.use("/oauth/", oauthRouter);

/********* OTHER ROUTES *********************************************/

/****** catch all ***********/
app.get("/*", function (req, res) {
  res.sendFile(__dirname + "/build/index.html", function (err) {
    if (err) {
      res.status(500).send(err);
      console.error("App.GET /* error: ", err);
    }
  });
});

/**** Create the Server ****/
app.listen(PORT, () => {
  console.log(`Kung-Fu-Lighting Server running on port ${PORT}`);
});

/*** Start the Scheduled Tasks ***/
const ScheduledTasks = require("./services/scheduledTasks");
ScheduledTasks();
