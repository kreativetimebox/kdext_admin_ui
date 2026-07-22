"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { registerQueryClient, registerRouter, resumeAllJobs } from "@/lib/reprocessRunner";

/**
 * Mounted once at the app root (see app/layout.js). Gives the reprocess
 * runner a queryClient to invalidate against and a router to redirect with
 * once a reprocess commits with the document still needing review, and
 * resumes any jobs left running in the persisted store, so reprocessing
 * survives navigation between pages and hard refreshes. Renders nothing.
 */
export default function ReprocessRunnerProvider() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    registerQueryClient(queryClient);
    registerRouter(router);
    resumeAllJobs();
  }, [queryClient, router]);

  return null;
}
