import { useState, useCallback } from 'react';

type CopyFeedback = "idle" | "copied" | "error";

interface UseCopyApiOptions {
  baseUrl?: string;
  feedbackTimeout?: number;
}

interface UseCopyApiReturn {
  copyFeedback: CopyFeedback;
  copyApiLink: (endpoint: string) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  resetFeedback: () => void;
}

export const useCopyApi = (options: UseCopyApiOptions = {}): UseCopyApiReturn => {
  const { baseUrl, feedbackTimeout = 2000 } = options;
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>("idle");

  const resetFeedback = useCallback(() => {
    setCopyFeedback("idle");
  }, []);

  const copyApiLink = useCallback(async (endpoint: string) => {
    try {
      const apiBaseUrl = baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
      const url = `${apiBaseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
      
      await navigator.clipboard.writeText(url);
      setCopyFeedback("copied");
      
      setTimeout(() => setCopyFeedback("idle"), feedbackTimeout);
    } catch {
      setCopyFeedback("error");
      setTimeout(() => setCopyFeedback("idle"), feedbackTimeout);
    }
  }, [baseUrl, feedbackTimeout]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("copied");
      
      setTimeout(() => setCopyFeedback("idle"), feedbackTimeout);
    } catch {
      setCopyFeedback("error");
      setTimeout(() => setCopyFeedback("idle"), feedbackTimeout);
    }
  }, [feedbackTimeout]);

  return {
    copyFeedback,
    copyApiLink,
    copyText,
    resetFeedback
  };
};
