import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const authHeader = request.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const idToken = url.searchParams.get("id_token") ?? null;

  function jwtDiag(label, token) {
    if (!token) {
      console.log(`[JWT-DIAG] ${label}: absent`);
      return;
    }

    const parts = token.split(".");

    console.log(
      `[JWT-DIAG] ${label}: present | totalBytes=${Buffer.byteLength(
        token,
        "utf8",
      )} | segments=${parts.length} | segmentLengths=${parts
        .map((part) => part.length)
        .join(",")}`,
    );
  }

  jwtDiag("Authorization Bearer", bearerToken);
  jwtDiag("id_token param", idToken);

  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app" rel="home">
          Dashboard
        </s-link>
        <s-link href="/app/store-overview">Store Overview</s-link>
        <s-link href="/app/business-analysis">Business Analysis</s-link>
        <s-link href="/app/action-strategy">Action & Strategy</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};