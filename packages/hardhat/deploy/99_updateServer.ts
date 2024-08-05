import { DeployFunction } from "hardhat-deploy/types";
import * as fs from "fs";
import * as http from "http";
import { open } from "openurl";
import * as os from "os";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const TOKEN_CACHE_PATH = os.homedir() + "/.ethereum-quest-token";
const CHALLENGE_SLUG = "test";

function getCachedServerToken() {
  try {
    const cachedToken = fs.readFileSync(TOKEN_CACHE_PATH);
    return cachedToken.toString();
  } catch {
    return null;
  }
}

function spawnTokenServer() {
  return new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url, `http://${req.headers.host}`);
      const token = reqUrl.searchParams.get("token");

      if (!token) {
        reject("No token provided");
        return;
      }

      fs.writeFileSync(TOKEN_CACHE_PATH, token);
      res.end("Token received. You can close this window now.");

      resolve(token);
    });

    server.listen(0, "localhost", async () => {
      console.log(
        "We need you to sign a transaction to authenticate. If the following page doesn't open, please open it manually:",
      );
      const url = `https://eq.byteatatime.dev/auth?r=http://localhost:${server.address().port}`;
      console.log(url);
      open(url);
    });
  });
}

const updateServer: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  let token = getCachedServerToken();

  if (!token) {
    token = await spawnTokenServer();
  }

  const chainId = parseInt(await hre.getChainId());
  const deployments = Object.fromEntries(
    Object.entries(await hre.deployments.all()).map(([name, deployment]) => [name, deployment.address]),
  );

  const update = await fetch("https://eq.byteatatime.dev/api/submitDeployedContracts", {
    method: "POST",
    body: JSON.stringify({
      token,
      chainId,
      deployedContracts: deployments,
      challengeSlug: CHALLENGE_SLUG,
    }),
  });

  if (update.status === 401) {
    // maybe the token expired, let's try again
    fs.rmSync(TOKEN_CACHE_PATH);

    token = await spawnTokenServer();

    const update = await fetch("https://eq.byteatatime.dev/api/submitDeployedContracts", {
      method: "POST",
      body: JSON.stringify({
        token,
        chainId,
        deployedContracts: deployments,
        challengeSlug: CHALLENGE_SLUG,
      }),
    });

    if (!update.ok) {
      throw new Error("Failed to update server: " + update.statusText);
    }
  } else if (!update.ok) {
    throw new Error("Failed to update server: " + update.statusText);
  } else {
    console.log("Server updated");
  }
};

export default updateServer;

updateServer.tags = ["updateServer"];

updateServer.runAtTheEnd = true;
