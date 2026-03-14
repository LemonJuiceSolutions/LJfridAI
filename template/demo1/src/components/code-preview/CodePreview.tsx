import { useCallback, useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github-dark.css'; // Preferred highlight.js style
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
import { Button } from 'react-bootstrap';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('xml', xml);

const CodePreview = ({ code, language }: { code: string; language: string }) => {
  const codeRef = useRef<HTMLElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  const handleCopy = useCallback(async () => {
    const codeElement = codeRef.current;
    const copyButton = copyButtonRef.current;

    if (!codeElement?.textContent || !copyButton) return;

    try {
      await navigator.clipboard.writeText(codeElement.textContent);
      copyButton.textContent = 'Copied';
      const timeoutId = setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1000);

      // Clear the timeout if the component unmounts
      return () => clearTimeout(timeoutId);
    } catch (error) {
      console.error('Failed to copy code:', error);
      alert('Failed to copy code to clipboard.');
    }
  }, []);

  useEffect(() => {
    const codeElement = codeRef.current;
    if (!codeElement) return;
    delete codeElement.dataset.highlighted; // Allow re-highlighting by unsetting the `dataset.highlighted` property
    codeElement.textContent = code;
    hljs.highlightElement(codeElement);
  }, [code, language]);

  return (
    <section className="highlight">
      <pre>
        <code ref={codeRef} className={`language-${language}`} />
      </pre>
      <Button ref={copyButtonRef} className="btn-clipboard" onClick={handleCopy}>
        Copy
      </Button>
    </section>
  );
};

export default CodePreview;
