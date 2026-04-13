/**
 * Prism code formatting
 */
import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import {
  ContentCopy as CopyIcon,
  ThumbUp as ThumbUpIcon,
} from "@mui/icons-material";
import Prism from "prismjs";
import "prismjs/components/prism-javascript"; // Import the language component
import "prismjs/components/prism-typescript"; // Import additional languages as needed
import "prismjs/components/prism-json";
import "../assets/css/prism-dark.css";
//import "../App.css"; // Commenting-out, probably exists on all pages

interface CodeFormatProps {
  code: string;
  language: string;
}

const CodeFormat: React.FC<CodeFormatProps> = ({ code, language }) => {
  const codeRef = useRef<HTMLElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [copySucceeded, setCopySucceeded] = useState<boolean>(false);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopySucceeded(true);

      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }

      copyResetTimerRef.current = window.setTimeout(() => {
        setCopySucceeded(false);
        copyResetTimerRef.current = null;
      }, 1200);
    } catch (error) {
      console.error("Failed to copy code block:", error);
    }
  };

  return (
    <Box className="code-format" sx={{ position: "relative" }}>
      <Tooltip title={copySucceeded ? "Copied" : "Copy code"}>
        <IconButton
          className="code-format__copy-button"
          size="small"
          onClick={handleCopy}
          sx={{ position: "absolute", top: 10, right: 10, zIndex: 1 }}
        >
          {copySucceeded ? (
            <ThumbUpIcon fontSize="small" color="success" />
          ) : (
            <CopyIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <pre className={`code-format__pre language-${language}`}>
        <code
          ref={codeRef}
          className={`code-format__code language-${language}`}
        >
          {code}
        </code>
      </pre>
    </Box>
  );
};

export default CodeFormat;
