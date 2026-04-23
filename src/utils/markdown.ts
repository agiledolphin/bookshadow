function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');
}

export function renderMarkdown(raw: string): string {
  const out: string[] = [];
  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      out.push(`<pre><code>${esc(codeLines.join('\n'))}</code></pre>`);
      i++;
      continue;
    }

    // heading
    const hm = line.match(/^(#{1,3}) (.+)/);
    if (hm) {
      out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`);
      i++;
      continue;
    }

    // blockquote
    if (line.startsWith('> ')) {
      const bq: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        bq.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote>${bq.map(inline).join('<br/>')}</blockquote>`);
      continue;
    }

    // unordered list
    if (/^[-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*+] /, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // horizontal rule
    if (/^[-*]{3,}$/.test(line.trim())) {
      out.push('<hr/>');
      i++;
      continue;
    }

    // blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // paragraph
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3} |> |[-*+] |\d+\. |```|[-*]{3,}$)/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${para.map(inline).join('<br/>')}</p>`);
  }

  return out.join('\n');
}
