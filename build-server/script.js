const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const {S3Client,PutObjectCommand} = require("@aws-sdk/client-s3");
const mime = require('mime-types');

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: '',
        secretAccessKey:'',
    }
});

const PROJECT_ID = process.env.PROJECT_ID;


async function init() {
  console.log("Executing script.js");
  const outDirPath = path.join(__dirname, "output");

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);
  p.stdout.on("data", function (data) {
    console.log(data.toString());
  });

  p.stdout.on("error", function (data) {
    console.log("Error", data.toString());
  });

  p.on("close",async function () {
    console.log("Build complete");
    const distFolderPath = path.join(__dirname, "output", "dist");
    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    for(const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file)
        //only path to files are uploaded to s3 not directories
        if(fs.lstatSync(filePath).isDirectory()) continue;

        console.log('uploading',filePath);

        const command = new PutObjectCommand({
            Bucket: 'vercel-clone-outputs-bucket',
            Key: `__outputs/${PROJECT_ID}/${file}`,
            Body: fs.createReadStream(filePath),
            ContentType: mime.lookup(filePath)
        });

        await s3Client.send(command);

        console.log('uploaded',filePath);
    }
    console.log('Done...');
  });
}

init();