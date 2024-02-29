const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");

const app = express();
const PORT = 9000;

const ecsClient = new ECSClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: "",
    secretAccessKey: "",
  },
});

const config = {
  CLUSTER: "arn:aws:ecs:ap-south-1:151366016183:cluster/build-cluster",
  TASK: "arn:aws:ecs:ap-south-1:151366016183:task-definition/build-task",
};

app.use(express.json());

app.post("/project", async (req, res) => {
  const { gitUrl } = req.body;
  const projectSlug = generateSlug();

  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: [
          "subnet-0cb11d10af7086527",
          "subnet-00553033dc539607f",
          "subnet-00c549eb6f26adba0",
        ],
        securityGroups: ["sg-0faf49af342215381"],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "build-server-image",
          environment: [
            { name: "GIT_REPOSITORY_URL", value: gitUrl },
            { name: "PROJECT_ID", value: projectSlug },
          ],
        },
      ],
    },
  });

  await ecsClient.send(command);

  return res.json({
    status: "queued",
    data: {
      projectSlug,
      url: `http://${projectSlug}.localhost:8000`,
    },
  });
});

app.listen(PORT, () => {
  console.log(`api server listening on ${PORT}`);
});
