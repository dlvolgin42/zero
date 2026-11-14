import type { MetadataRoute } from "next";

// Makes the site installable as an app on the home screen (Android Chrome, iOS Safari).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zero",
    short_name: "Zero",
    description: "Общие траты с друзьями: кто кому сколько должен",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f6f8",
    theme_color: "#f6f6f8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
