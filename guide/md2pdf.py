# 안내서.md → 안내서.html → (크롬 헤드리스) 안내서.pdf. 외부 라이브러리 없이 이 안내서에 쓰인 문법만 변환
import re, sys, html, subprocess, os
src, out_html, out_pdf = sys.argv[1], sys.argv[2], sys.argv[3]
md = open(src, encoding='utf-8').read().split('\n')
def inline(t):
    t = html.escape(t, quote=False).replace('&lt;small&gt;', '<small>').replace('&lt;/small&gt;', '</small>')
    t = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1">', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return t
o, i = [], 0
while i < len(md):
    l = md[i]
    if not l.strip(): i += 1; continue
    if l.startswith('---'): o.append('<hr>'); i += 1; continue
    m = re.match(r'(#{1,3}) (.*)', l)
    if m: o.append(f'<h{len(m[1])}>{inline(m[2])}</h{len(m[1])}>'); i += 1; continue
    if l.startswith('!['): o.append(f'<figure>{inline(l)}</figure>'); i += 1; continue
    if l.startswith('>'):
        q = []
        while i < len(md) and md[i].startswith('>'): q.append(md[i][1:].strip()); i += 1
        o.append('<blockquote>' + inline(' '.join(q)) + '</blockquote>'); continue
    if l.startswith('|'):
        rows = []
        while i < len(md) and md[i].startswith('|'):
            if not re.match(r'^\|[-| ]+\|$', md[i]): rows.append([c.strip() for c in md[i].strip('|').split('|')])
            i += 1
        t = '<table><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in rows[0]) + '</tr>'
        t += ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in rows[1:]) + '</table>'
        o.append(t); continue
    if re.match(r'(- |\d+\. )', l):
        tag = 'ol' if re.match(r'\d+\. ', l) else 'ul'; items = []
        while i < len(md) and re.match(r'(- |\d+\. )', md[i]): items.append(re.sub(r'^(- |\d+\. )', '', md[i])); i += 1
        o.append(f'<{tag}>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + f'</{tag}>'); continue
    p = []
    while i < len(md) and md[i].strip() and not re.match(r'(#|- |\d+\. |\||>|!\[|---)', md[i]): p.append(md[i]); i += 1
    o.append('<p>' + inline(' '.join(p)) + '</p>')
css = """@page{size:A4;margin:16mm 15mm}body{font-family:"Apple SD Gothic Neo","Noto Sans KR",sans-serif;font-size:10.5pt;line-height:1.65;color:#1d2329}
h1{font-size:20pt;margin:0 0 10px;color:#111}h2{font-size:15pt;margin:26px 0 8px;padding-bottom:4px;border-bottom:2px solid #1f5eff;break-after:avoid}
h3{font-size:12pt;margin:18px 0 6px;color:#1f3f9e;break-after:avoid}figure{margin:10px 0;text-align:center;break-inside:avoid}
img{max-width:100%;max-height:120mm;border:1px solid #dde1e6;border-radius:6px}table{border-collapse:collapse;width:100%;margin:8px 0;break-inside:avoid}
th,td{border:1px solid #dde1e6;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f4fa}
blockquote{margin:10px 0;padding:8px 12px;background:#fff8e1;border-left:4px solid #f2b705;border-radius:4px}code{background:#f1f3f4;padding:1px 5px;border-radius:4px;font-size:9.5pt}
hr{border:none;border-top:1px solid #e3e3df;margin:18px 0}small{color:#8a9099}"""
open(out_html, 'w', encoding='utf-8').write(f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지원서 자동입력 안내서</title><style>{css}</style></head><body>' + '\n'.join(o) + '</body></html>')
ch = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
subprocess.run([ch, '--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=/private/tmp/claude-501/headless-guide', '--no-pdf-header-footer', f'--print-to-pdf={out_pdf}', 'file://' + os.path.abspath(out_html)], capture_output=True, timeout=120)
print('ok', os.path.getsize(out_pdf))
