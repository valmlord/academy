import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Better Auth authenticates its own endpoints. The instance is resolved per request, so next build
// never creates it (it would need the secret and the database).
export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
