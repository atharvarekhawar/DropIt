const express = require('express');
const httpProxy = require('http-proxy');
const { PrismaClient } = require("@prisma/client");

const app = express();
const PORT = 8000;

const BASE_PATH = "https://vercel-clone-outputs-bucket.s3.ap-south-1.amazonaws.com/__outputs";

const proxy = httpProxy.createProxy();
const prisma = new PrismaClient({});

app.use(async (req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split(".")[0];

  const project = await prisma.project.findFirst({
    where: {
      subDomain: subdomain,
    }
  })

  const resolvesTo = `${BASE_PATH}/${project.id}`;

  return proxy.web(req, res, { target: resolvesTo, changeOrigin: true });
});

proxy.on('proxyReq',(proxyReq,req,res)=>{
  const url = req.url;
  if(url === '/'){
    proxyReq.path+='index.html';
  }
})

app.listen(PORT, () => {
  console.log(`Reverse proxy running on port ${PORT}`);
});
