const ScrapePushShiftToKFL = require("./scrapePushShiftToKFL");
const { FindNewLinks } = require("./findNewLinks");
const { AnalyzeNewLinks } = require("./analyzeNewLinks");

/**
 * ### ScrapeAndAnalyze ###
 * Scrape new Redditposts from Pushshift,
 * find all new CommentLinks from all new Redditposts,
 * analyze every NEW CommentLink for new Chromaprofiles
 * @returns { scraped: number, linked: number, profiled: number  }
 * number of posts scraped, links found, and chromaprofiles created
 */
module.exports = async function ScrapeAndAnalyze() {
  const inserted = await ScrapePushShiftToKFL();
  const numLinks = await FindNewLinks();
  const result = await AnalyzeNewLinks();
  console.log(
    `### ScrapeAndAnalyze started ${new Date().toLocaleString()}`,
    `${numLinks} new Links, ${inserted.length} new posts, ${result} new Chromaprofiles`
  );

  return { scraped: inserted.length, linked: numLinks, profiled: result };
};
