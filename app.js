const express = require("express");
const {
  lintFromString,
  createConfig,
  stringifyYaml,
} = require("@redocly/openapi-core");
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

async function validateRedoclyYaml(fileContent) {
  console.log("File Content:", fileContent);

  try {
    const config = await createConfig({
      extends: ["minimal"],
      rules: {
        "operation-description": "error",
      },
    });

    const source = stringifyYaml(fileContent);
    const result = await lintFromString({
      source,
      config,
    });

    const errors = result.filter((issue) => issue.severity === "error");
    const warnings = result.filter((issue) => issue.severity === "warn");

    if (errors.length > 0 || warnings.length > 0) {
      console.log("Validation failed:");

      errors.forEach((err) => console.log("Error:", err));
      warnings.forEach((warn) => console.log("Warning:", warn));

      return false;
    }

    console.log("Validation passed");
    return true;
  } catch (error) {
    console.error("Error validating openapi.json:", error.message || error);
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
      const filesResponse = await axios.get(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pullRequestNumber}/files`,
        {
          headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
        }
      );

      const redoclyFile = filesResponse.data.find(
        (file) => file.filename === "openapi.json"
      );

      if (redoclyFile) {
        if (redoclyFile.status === "removed") {
          console.log("openapi.json has been removed in this PR.");
          res.status(200).send("openapi.json has been removed in this PR.");
        } else {
          console.log("Found openapi.json, fetching content...");

          const fileContentResponse = await axios.get(redoclyFile.raw_url);
          const fileContent = fileContentResponse.data;

          const isFileValid = await validateRedoclyYaml(fileContent);

          if (isFileValid) {
            console.log("openapi.json is valid");
            res.status(200).send("openapi.json is valid");
          } else {
            console.log("openapi.json is invalid");
            res.status(200).send("openapi.json is invalid");
          }
        }
      } else {
        console.log("openapi.json file not found in the pull request.");
        res.status(200).send("No openapi.json file found in the pull request.");
      }
    } catch (error) {
      console.error(
        "Error fetching PR details or files:",
        error.message || error
      );
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
