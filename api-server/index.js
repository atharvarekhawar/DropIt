const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const { Server } = require("socket.io");
const Redis = require("ioredis");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");

require("dotenv").config();

const app = express();
const PORT = 9000;

const prisma = new PrismaClient({});

const subscriber = new Redis(process.env.REDIS_URL);

const io = new Server({ cors: "*" });
io.listen(9001, () => {
  console.log("Socket server 9001");
});

io.on("connection", (socket) => {
  socket.on("subscribe", (channel) => {
    socket.join(channel);
    socket.emit("message", `joined ${channel}`);
  });
});

const ecsClient = new ECSClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.accessKeyId,
    secretAccessKey: process.env.secretAccessKey,
  },
});

const config = {
  CLUSTER: "arn:aws:ecs:ap-south-1:151366016183:cluster/build-cluster",
  TASK: "arn:aws:ecs:ap-south-1:151366016183:task-definition/build-task",
};

app.use(express.json());

app.post("/project", async (req, res) => {
  const schema = z.object({
    name: z.string(),
    gitUrl: z.string().min(1),
  });

  const safeParseResult = schema.safeParse(req.body);

  if (safeParseResult.error) {
    return res.status(400).json({
      error: safeParseResult.error,
    });
  }

  const { name, gitUrl } = safeParseResult.data;

  const project = await prisma.project.create({
    data: {
      name,
      gitUrl,
      subDomain: generateSlug(),
    },
  });

  return res.status(200).json({
    status: "success",
    data: { project },
  });
});

app.post("/deploy", async (req, res) => {
  const { projectId } = req.body;

  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
  });

  if (!project) {
    return res.status(404).json({
      error: "Project not found",
    });
  }

  const deployment = await prisma.deployment.create({
    data: {
      project: { connect: { id: projectId } },
      status: "QUEUED",
    },
  });

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
            { name: "GIT_REPOSITORY_URL", value: project.gitUrl },
            { name: "PROJECT_ID", value: projectId },
            { name: "DEPLOYMENT_ID", value: deployment.id },
          ],
        },
      ],
    },
  });

  await ecsClient.send(command);

  return res.json({
    status: "queued",
    data: {
      data: { deploymentId: deployment.id },
    },
  });
});

function initRedisSubscribe() {
  console.log("Subscribed to logs...");
  subscriber.psubscribe("logs:*");
  subscriber.on("pmessage", (pattern, channel, message) => {
    io.to(channel).emit("message", message);
  });
}

initRedisSubscribe();

app.listen(PORT, () => {
  console.log(`api server listening on ${PORT}`);
});
