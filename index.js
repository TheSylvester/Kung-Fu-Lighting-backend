const express = require("express");
const app = express();

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Kung-Fu-Lighting Server running on port ${PORT}`);
});

app.get("/", (request, response) => {
  response.send("<h1>Everybody is Kung-Fu Lighting!</h1>");
});
