const express = require("express");
const path = require("path");
const fs = require("fs");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
const { createClient } = require("@clickhouse/client");
const { Kafka } = require("kafkajs");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

require("dotenv").config();

const app = express();
const PORT = 9000;

const prisma = new PrismaClient({});

// const kafka = new Kafka({
//   clientId: `api-server`,
//   brokers: ["kafka-30cb6532-formhub.a.aivencloud.com:26879"],
//   ssl: {
//     ca: [fs.readFileSync(path.join(__dirname, "kafka.pem"), "utf-8")],
//   },
//   sasl: {
//     username: "avnadmin",
//     password: process.env.KAFKA_PASS,
//     mechanism: "plain",
//   },
// });

// const client = createClient({
//   host: "https://clickhouse-d4a70f6-formhub.a.aivencloud.com:26867",
//   database: "default",
//   username: "avnadmin",
//   password: process.env.CLICKHOUSE_PASS,
// });

// const consumer = kafka.consumer({
//   groupId: "api-server-logs-consumer",
// });

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
app.use(
  cors({
    origin: "*",
  })
);

app.post("/project", async (req, res) => {
  const schema = z.object({
    name: z.string(),
    gitUrl: z.string(),
  });

  const safeParseResult = schema.safeParse(req.body);

  if (safeParseResult.error) {
    return res.status(400).json({
      data:"safeParseError",
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
      deploymentId: deployment.id,
    },
  });
});

app.get("/logs/:id", async (req, res) => {
  const deploymentId = req.params.id;
  const logs = await client.query({
    query: `SELECT event_id, deployment_id, log, timestamp from log_events where deployment_id = {deployment_id:String}`,
    query_params: {
      deployment_id: deploymentId,
    },
    format: "JSONEachRow",
  });

  const rawLogs = await logs.json();

  return res.json({ logs: rawLogs });
});

async function initKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topics: ["container-logs"],
  });

  await consumer.run({
    autoCommit: false,
    eachBatch: async function ({
      batch,
      heartbeat,
      resolveOffset,
      commitOffsetsIfNecessary,
    }) {
      const messages = batch.messages;
      console.log(`recieved ${messages.length} messages...`);
      for (const message of messages) {
        if (!message.value) continue;
        const stringMessage = message.value.toString();
        const { PROJECT_ID, DEPLOYMENT_ID, log } = JSON.parse(stringMessage);
        console.log({ log, DEPLOYMENT_ID });
        try {
          const { query_id } = await client.insert({
            table: "log_events",
            values: [
              { event_id: uuidv4(), deployment_id: DEPLOYMENT_ID, log: log },
            ],
            format: "JSONEachRow",
          });
          console.log(query_id);
          resolveOffset(message.offset);
          await commitOffsetsIfNecessary(message.offset);
          await heartbeat();
        } catch (error) {
          console.log("error", error);
        }
      }
    },
  });
}

//initKafkaConsumer();

app.listen(PORT, () => {
  console.log(`api server listening on ${PORT}`);
});
