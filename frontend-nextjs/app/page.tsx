"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPen, Github } from "lucide-react";
import { Fira_Code } from "next/font/google";
import axios from "axios";

const firaCode = Fira_Code({ subsets: ["latin"] });

export default function Home() {
  const [projectName, setProjectName] = useState<string>("");
  const [repoURL, setRepoUrl] = useState<string>("");
  const [subdomain, setSubdomain] = useState<string>("");

  const [logs, setLogs] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);

  const [projectId, setProjectId] = useState<string | undefined>();
  const [deployPreviewURL, setDeployPreviewURL] = useState<
    string | undefined
  >();

  const logContainerRef = useRef<HTMLElement>(null);

  const isValidURL: [boolean, string | null] = useMemo(() => {
    if (!repoURL || repoURL.trim() === "") return [false, null];
    const regex = new RegExp(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)(?:\/)?$/
    );
    return [regex.test(repoURL), "Enter valid Github Repository URL"];
  }, [repoURL]);

  const handleClickDeploy = useCallback(async () => {
    setLoading(true);

    try {
      const payload = {
        name: projectName,
        gitUrl: repoURL,
      };
      const { data } = await axios.post(
        "http://localhost:9000/project",
        payload
      );

      if (data && data.data) {
        setProjectId(data.data.project.id);
        setSubdomain(data.data.project.subDomain);
      }

      // const deploymentPayload = {
      //   projectId: projectId,
      // };

      // const deploymentData = await axios.post("http://localhost:9000/deploy", deploymentPayload);

      // if (deploymentData && deploymentData.data) {
      //   const { deploymentId } = data.data;

      //   console.log(deploymentId);
      // }
    } catch (error) {
      console.error("Error occurred during POST request:", error);
    } finally {
      setLoading(false);
    }
  }, [projectName, repoURL]);

  const handleSocketIncommingMessage = useCallback((message: string) => {
    console.log(`[Incomming Socket Message]:`, typeof message, message);
    const { log } = JSON.parse(message);
    setLogs((prev) => [...prev, log]);
    logContainerRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // useEffect(() => {
  //   socket.on("message", handleSocketIncommingMessage);

  //   return () => {
  //     socket.off("message", handleSocketIncommingMessage);
  //   };
  // }, [handleSocketIncommingMessage]);

  return (
    <main className="flex justify-center items-center h-[100vh]">
      <div className="w-[600px]">
        <span className="flex justify-start items-center gap-2 mb-2">
          <FolderPen className="text-5xl" />
          <Input
            disabled={loading}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            type="text"
            placeholder="Project name"
          />
        </span>
        <span className="flex justify-start items-center gap-2">
          <Github className="text-5xl" />
          <Input
            disabled={loading}
            value={repoURL}
            onChange={(e) => setRepoUrl(e.target.value)}
            type="url"
            placeholder="Github URL"
          />
        </span>
        <span></span>
        <Button
          onClick={handleClickDeploy}
          disabled={!isValidURL[0] || loading}
          className="w-full mt-3 cursor-pointer"
        >
          {loading ? "In Progress" : "Deploy"}
        </Button>
        {deployPreviewURL && (
          <div className="mt-2 bg-slate-900 py-4 px-2 rounded-lg">
            <p>
              Preview URL{" "}
              <a
                target="_blank"
                className="text-sky-400 bg-sky-950 px-3 py-2 rounded-lg"
                href={deployPreviewURL}
              >
                {deployPreviewURL}
              </a>
            </p>
          </div>
        )}
        {logs.length > 0 && (
          <div
            className={`${firaCode.className} text-sm text-green-500 logs-container mt-5 border-green-500 border-2 rounded-lg p-4 h-[300px] overflow-y-auto`}
          >
            <pre className="flex flex-col gap-1">
              {logs.map((log, i) => (
                <code
                  ref={logs.length - 1 === i ? logContainerRef : undefined}
                  key={i}
                >{`> ${log}`}</code>
              ))}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
