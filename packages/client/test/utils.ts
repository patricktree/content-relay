import net from "node:net";

export async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not determine an ephemeral TCP port."));

        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error !== undefined) {
          reject(error);

          return;
        }

        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

export async function listenOnPort(server: net.Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
}
