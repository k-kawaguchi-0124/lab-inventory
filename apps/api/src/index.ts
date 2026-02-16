import Fastify from "fastify";

const app = Fastify();

app.get("/health", async () => ({ ok: true }));

app.listen({ port: 3000, host: "0.0.0.0" }).then(() => {
  console.log("API listening on :3000");
});
