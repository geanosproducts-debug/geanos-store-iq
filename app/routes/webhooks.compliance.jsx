import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  // GEANOS Store IQ does not keep separate customer records.
  // When Shopify requests shop deletion, remove the shop's saved sessions.
  if (topic === "SHOP_REDACT") {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
