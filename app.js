const express = require("express");
const app = express();

const dotenv = require("dotenv");

const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, Express!");
});

app.post("/webhook", (req, res) => {
  console.log(req.body);
  res.status(200).end();
});

app.webhooks.on("pull_request.opened", handlePullRequestOpened);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
