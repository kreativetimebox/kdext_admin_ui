"use client";

import "./globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useRef } from "react";
import ReprocessRunnerProvider from "@/components/Reprocess/ReprocessRunnerProvider";

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
        <title>TechDexAI — Admin Portal</title>
        <meta name="description" content="Admin portal for techdexai_doc_parser — internal document parsing result review and correction." />
      </head>
      <body>
        <QueryClientProvider client={queryClientRef.current}>
          <ReprocessRunnerProvider />
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                fontSize: "13px",
                maxWidth: "360px",
              },
              success: {
                iconTheme: { primary: "#3b82f6", secondary: "#fff" },
              },
            }}
          />
        </QueryClientProvider>
      </body>
    </html>
  );
}
