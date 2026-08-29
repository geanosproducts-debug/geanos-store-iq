import { authenticate } from "../shopify.server";
import { getMediaCreditPackByName } from "../services/media-credit-packs";
import { grantMediaCredits } from "../services/media-credits.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  const purchase = payload?.app_purchase_one_time;

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!purchase) {
    console.error("One-time purchase webhook payload was missing.");
    return new Response();
  }

  if (purchase.status !== "ACTIVE") {
    console.log(
      `One-time purchase ${purchase.admin_graphql_api_id} has status ${purchase.status}.`,
    );
    return new Response();
  }

  const pack = getMediaCreditPackByName(purchase.name);

  if (!pack) {
    console.error(
      `No photo-credit pack matched Shopify purchase "${purchase.name}".`,
    );
    return new Response();
  }

  try {
    await grantMediaCredits({
      shop,
      amount: pack.credits,
      type: "purchase",
      externalReference: purchase.admin_graphql_api_id,
    });

    console.log(
      `Added ${pack.credits} purchased photo credits to ${shop}.`,
    );
  } catch (error) {
    if (error?.code === "P2002") {
      console.log(
        `One-time purchase ${purchase.admin_graphql_api_id} was already granted.`,
      );
      return new Response();
    }

    throw error;
  }

  return new Response();
};