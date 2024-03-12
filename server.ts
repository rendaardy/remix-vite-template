import path from "node:path";
import url from "node:url";

import { createRequestHandler } from "@mcansh/remix-fastify";
import { type FastifyInstance, fastify } from "fastify";

const vite =
	process.env.NODE_ENV === "production"
		? undefined
		: await import("vite").then((m) =>
				m.createServer({ server: { middlewareMode: true } }),
		  );
const app = fastify({ logger: true });

if (vite) {
	const fastifyMiddie = await import("@fastify/middie").then((m) => m.default);
	await app.register(fastifyMiddie);
	await app.use(vite.middlewares);
} else {
	const fastifyStatic = await import("@fastify/static").then((m) => m.default);
	await app.register(fastifyStatic, {
		root: path.join(__dirname, "build", "client", "assets"),
		prefix: "/assets",
		wildcard: true,
		decorateReply: false,
		cacheControl: true,
		dotfiles: "allow",
		etag: true,
		maxAge: "1yr",
		immutable: true,
		serveDotFiles: true,
		lastModified: true,
	});
	await app.register(fastifyStatic, {
		root: path.join(__dirname, "build", "client"),
		prefix: "/",
		wildcard: false,
		cacheControl: true,
		dotfiles: "allow",
		etag: true,
		maxAge: "1yr",
		serveDotFiles: true,
		lastModified: true,
	});
}

await app.register(async function remixPlugin(childApp: FastifyInstance) {
	childApp.removeAllContentTypeParsers();

	childApp.addContentTypeParser("*", (request, payload, done) => {
		done(null, payload);
	});

	childApp.all("*", async (request, reply) => {
		try {
			const handler = createRequestHandler({
				build: vite
					? () => vite?.ssrLoadModule("virtual:remix/server-build")
					: // @ts-ignore
					  await import("./build/server/index.js"),
			});

			return handler(request, reply);
		} catch (error) {
			childApp.log.error(error);
			return reply.status(500).send(error);
		}
	});
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
await app.listen({ port });
