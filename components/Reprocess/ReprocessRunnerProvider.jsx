"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { registerQueryClient, resumeAllJobs } from "@/lib/reprocessRunner";

/**
 * Mounted once at the app root (see app/layout.js). Gives the reprocess
 * runner a queryClient to invalidate against and resumes any jobs left
 * running in the persisted store, so reprocessing survives navigation
 * between pages and hard refreshes. Renders nothing.
 */
export default function ReprocessRunnerProvider() {
  const queryClient = useQueryClient();

  useEffect(() => {
    registerQueryClient(queryClient);
    resumeAllJobs();
  }, [queryClient]);

  return null;
}
