import { Check, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ lang, text }: { lang?: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="codeblock">
      <div className="codehead">
        <span>{lang || "код"}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Копировать код"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setDone(true);
              window.setTimeout(() => setDone(false), 1400);
            });
          }}
        >
          {done ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-v">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const raw = String(children).replace(/\n$/, "");
            const lang = /language-([\w+-]+)/.exec(className || "")?.[1];
            if (!className) return <code className="inline-code">{children}</code>;
            return <CodeBlock lang={lang} text={raw} />;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
