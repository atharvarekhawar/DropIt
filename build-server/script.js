const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const mime = require("mime-types");

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Kafka } = require("kafkajs");

require("dotenv").config();

const PROJECT_ID = process.env.PROJECT_ID;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.accessKeyId,
    secretAccessKey: process.env.secretAccessKey,
  },
});

const kafka = new Kafka({
  clientId: `docker-build-server-${DEPLOYMENT_ID}`,
  brokers: ["kafka-30cb6532-formhub.a.aivencloud.com:26879"],
  ssl: {
    ca: [fs.readFileSync(path.join(__dirname, "kafka.pem"), "utf-8")],
  },
  sasl: {
    username: "avnadmin",
    password: process.env.KAFKA_PASS,
    mechanism: "plain",
  },
});

const producer = kafka.producer();

async function publishLog(log) {
  await producer.send({
    topic: "container-logs",
    messages: [
      { key: "log", value: JSON.stringify({ PROJECT_ID, DEPLOYMENT_ID, log }) },
    ],
  });
}

async function init() {
  await producer.connect();

  console.log("Executing script.js");
  await publishLog("Build started...");

  const outDirPath = path.join(__dirname, "output");

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on("data", async function (data) {
    console.log(data.toString());
    await publishLog(data.toString());
  });

  p.stdout.on("error", async function (data) {
    console.log("Error", data.toString());
    await publishLog(`error : ${data.toString()}`);
  });

  p.on("close", async function () {
    console.log("Build complete");
    await publishLog("Build complete");
    const distFolderPath = path.join(__dirname, "output", "dist");
    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    await publishLog("Starting to upload...");

    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file);
      //only path to files are uploaded to s3 not directories
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log("uploading", filePath);
      await publishLog(`Uploading ${file}`);

      const command = new PutObjectCommand({
        Bucket: "vercel-clone-outputs-bucket",
        Key: `__outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath),
      });

      await s3Client.send(command);

      console.log("uploaded", filePath);
      await publishLog(`Uploaded ${file}`);
    }
    console.log("Done...");
    publishLog("Done...");
    process.exit(0);
  });
}

init();
