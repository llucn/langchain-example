import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './markdown.css';

/**
 * Renders Markdown (GFM) with the app's theme tokens. Raw HTML in the text is not rendered.
 * `breaks` keeps single newlines, for text typed by the user.
 */
export function Markdown({ children, breaks = false }: { children: string; breaks?: boolean }) {
  return (
    <div className={breaks ? 'md md--breaks' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
