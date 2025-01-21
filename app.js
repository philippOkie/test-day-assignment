const express = require("express");
require("dotenv").config();
const axios = require("axios");
const {
  lintFromString,
  createConfig,
  stringifyYaml,
} = require("@redocly/openapi-core");

const app = express();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "philippOkie";
const REPO_NAME = "webhooks-test";
const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, Express!");
});

// Set commit status on GitHub
async function setCommitStatus(commitSha, state, description) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/statuses/${commitSha}`;
  const data = {
    state,
    description,
    context: "openapi-validation",
  };

  try {
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    console.log(`Commit status set to ${state}`);
  } catch (error) {
    console.error("Error setting commit status:", error.message || error);
  }
}

async function validateRedoclyYaml(fileContent) {
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

      return { state: "failure", message: "Validation failed" };
    }

    console.log("Validation passed");
    return { state: "success", message: "Validation passed" };
  } catch (error) {
    console.error("Error validating openapi.json:", error.message || error);
    return { state: "error", message: "Error validating the OpenAPI file" };
  }
}

app.post("/webhook", async (req, res) => {
  const event = req.body;

  if (event.action === "opened" || event.action === "synchronize") {
    console.log(`Handling pull request ${event.action}`);

    const pullRequestNumber = event.pull_request
      ? event.pull_request.number
      : null;
    const commitSha = event.pull_request?.head.sha;

    if (!pullRequestNumber || !commitSha) {
      console.error("No pull request number or commit sha found in the event.");
      return res
        .status(400)
        .send("No pull request number or commit sha found in the event.");
    }

    try {
      const filesResponse = await axios.get(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pullRequestNumber}/files`
      );

      const redoclyFile = filesResponse.data.find(
        (file) => file.filename === "openapi.json"
      );

      if (redoclyFile) {
        if (redoclyFile.status === "removed") {
          console.log("openapi.json has been removed in this PR.");
          await setCommitStatus(commitSha, "success", "openapi.json removed.");
          res.status(200).send("openapi.json has been removed in this PR.");
        } else {
          console.log("Found openapi.json, fetching content...");

          const fileContentResponse = await axios.get(redoclyFile.raw_url);
          const fileContent = fileContentResponse.data;

          const validationResult = await validateRedoclyYaml(fileContent);
          await setCommitStatus(
            commitSha,
            validationResult.state,
            validationResult.message
          );

          res.status(200).send(validationResult.message);
        }
      } else {
        console.log("openapi.json file not found in the pull request.");
        await setCommitStatus(
          commitSha,
          "success",
          "No openapi.json file found."
        );
        res.status(200).send("No openapi.json file found in the pull request.");
      }
    } catch (error) {
      console.error(
        "Error fetching PR details or files:",
        error.message || error
      );
      await setCommitStatus(commitSha, "error", "Error processing the webhook");
      res.status(500).send("Error processing the webhook");
    }
  } else {
    res.status(200).send("Ignoring event");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
