import { Children, isValidElement, memo, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import { MermaidDiagram } from "./MermaidDiagram"
import { looksLikeMermaidSource } from "./mermaid-source"

type CodeElementProps = {
  className?: string
  children?: ReactNode
}

const isMermaidCodeClass = (className?: string) => /\blanguage-mermaid\b/i.test(className ?? "")

const getCodeText = (children: ReactNode): string =>
  Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? child : ""))
    .join("")

export const MarkdownMessage = memo(({ content }: { content: string }) => (
  <div className="markdown-message">
    <ReactMarkdown
      rehypePlugins={[rehypeHighlight]}
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => (
          <a {...props} href={href} rel="noreferrer noopener" target="_blank">
            {children}
          </a>
        ),
        pre: ({ children, ...props }) => {
          const childElements = Children.toArray(children)
          const codeElement = childElements.length === 1 ? childElements[0] : null

          if (isValidElement<CodeElementProps>(codeElement)) {
            const source = getCodeText(codeElement.props.children)

            if (isMermaidCodeClass(codeElement.props.className) || looksLikeMermaidSource(source)) {
              return <MermaidDiagram source={source} />
            }
          }

          return <pre {...props}>{children}</pre>
        }
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
))
