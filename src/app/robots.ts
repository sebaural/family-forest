import type { MetadataRoute } from "next";
import { env } from "@/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in pages and APIs have nothing for search engines.
      disallow: ["/api/", "/dashboard", "/tree/", "/settings", "/onboarding", "/invite/"],
    },
    host: env.NEXT_PUBLIC_APP_URL,
  };
}
