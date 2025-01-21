const express = require("express");
const { lintConfig } = require("@redocly/openapi-core");
const fs = require("fs");
const axios = require("axios");

require("dotenv").config();

const app = express();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "philippOkie";
const REPO_NAME = "webhooks-test";

const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, Express!");
});

async function validateRedoclyYaml(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");

    const yamlData = yaml.load(fileContent);

    // Validate the YAML content using lintConfig from @redocly/openapi-core
    const result = await lintConfig(yamlData);

    if (result.errors.length > 0 || result.warnings.length > 0) {
      console.log("Validation failed:", result.errors);
      return false;
    }

    console.log("Validation passed");
    return true;
  } catch (error) {
    console.error("Error validating redocly.yaml:", error);
    return false;
  }
}

app.post("/webhook", async (req, res) => {
  console.log("Received webhook event:", req.body);

  const event = req.body;

  if (event.action === "opened" || event.action === "synchronize") {
    console.log(`Handling pull request ${event.action}`);

    const pullRequestNumber = event.pull_request
      ? event.pull_request.number
      : null;

    if (!pullRequestNumber) {
      console.error("No pull request number found in the event.");
      return res.status(400).send("No pull request number found in the event.");
    }

    try {
      const response = await axios.get(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pullRequestNumber}`,
        {
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
        }
      );

      const pullRequest = response.data;
      console.log(`Fetched PR details:`, pullRequest.title);

      const filesResponse = await axios.get(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`,
        {
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
        }
      );

      const redoclyFile = filesResponse.data.find(
        (file) => file.name === "redocly.yaml"
      );

      if (redoclyFile) {
        console.log("Found redocly.yaml, fetching content...");

        const fileContentResponse = await axios.get(redoclyFile.download_url);
        const fileContent = fileContentResponse.data;

        const isFileValid = await validateRedoclyYaml(fileContent);

        if (isFileValid) {
          console.log("redocly.yaml is valid");
          res.status(200).send("redocly.yaml is valid");
        } else {
          console.log("redocly.yaml is invalid");
          res.status(200).send("redocly.yaml is invalid");
        }
      } else {
        console.log("redocly.yaml file not found in the pull request.");
        res.status(200).send("No redocly.yaml file found in the pull request.");
      }
    } catch (error) {
      console.error("Error fetching PR details or files:", error);
      res.status(500).send("Error processing the webhook");
    }
  } else {
    console.log("Ignoring non-synchronize action");
    res.status(200).send("Ignoring event");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
