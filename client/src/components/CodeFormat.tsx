/**
 * Prism code formatting
 */
import React, { useEffect } from "react";
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
  useEffect(() => Prism.highlightAll(), [code, language]);

  return (
    <pre className="prism">
      <code className={`prism language-${language}`}>{code}</code>
    </pre>
  );
};

export default CodeFormat;
