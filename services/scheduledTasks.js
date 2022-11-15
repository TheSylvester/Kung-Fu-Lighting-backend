const cron = require("node-cron");
const RefreshRedditPosts = require("../controllers/refreshRedditPosts");
const ScrapeAndAnalyze = require("../controllers/scrapeAndAnalyze");
const { TagFeaturedProfiles } = require("./chromaprofiles");

const REFRESH_TIMER_MINUTES = 15; // refresh timer
const SCRAPE_TIMER_MINUTES = 45; // scrape timer

module.exports = function ScheduledTasks() {
  /****
   * Scheduling Scrape-and-Analyze, tag-featured-profiles, and refresh-redditposts
   */
  cron.schedule(`*/${REFRESH_TIMER_MINUTES} * * * *`, () => {
    console.log(
      `## Scheduled Task Running (every 15min) at ${new Date().toLocaleString()}`
    );
    (async function () {
      await RefreshRedditPosts();
    })();
  });
  cron.schedule(`*/${SCRAPE_TIMER_MINUTES} * * * *`, () => {
    console.log(
      `## Scheduled Task Running (every 45min) at ${new Date().toLocaleString()}`
    );
    (async function () {
      await ScrapeAndAnalyze();
      await TagFeaturedProfiles();
    })();
  });
};
