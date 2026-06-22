"use client";

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useRef } from "react";

export default function RootLayout({ children }) {
  const queryClientRef = useRef(null);
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          retry: 2,
        },
      },
    });
  }

  return (
    <html lang="en">
      <head>
        <title>kdext_doc_parser — Admin Portal</title>
        <meta name="description" content="Admin portal for kdext_doc_parser — internal document parsing result review and correction." />
      </head>
      <body>
        <QueryClientProvider client={queryClientRef.current}>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                fontSize: "13px",
                maxWidth: "360px",
                background: "var(--panel-bg)",
                color: "var(--foreground)",
                border: "1px solid var(--panel-border)",
                boxShadow: "var(--shadow-md)",
              },
              success: {
                iconTheme: { primary: "var(--success)", secondary: "#fff" },
              },
            }}
          />
        </QueryClientProvider>
      </body>
    </html>
  );
}
