import "@shopify/shopify-app-react-router/adapters/node";
import { createHash } from "crypto";
import {
  ApiVersion,
  AppDistribution,
   LogSeverity,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
const runtimeSecret = process.env.SHOPIFY_API_SECRET ?? "";
const runtimeSecretHash = createHash("sha256")
  .update(runtimeSecret)
  .digest("hex");
const runtimeSecretBytes = Buffer.byteLength(runtimeSecret, "utf8");

console.log(
  `[STARTUP] SHOPIFY_API_SECRET sha256=${runtimeSecretHash} bytes=${runtimeSecretBytes}`,
);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.SingleMerchant,
  logger: {
    level: LogSeverity.Debug,
},
  future: {
  expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
