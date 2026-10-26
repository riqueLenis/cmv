"""Gera o htmlJoao.html (arquivo único, abre direto no navegador, funciona offline).

Junta:  telas.dc.html (telas)  +  logica.js (regras)  +  dados_planilha.json (dados importados da planilha)
e empacota no mesmo formato do protótipo (base/htmlJoao.prototipo.html: runtime, React, fontes e logos).

uso: python build.py            -> ../htmlJoao.html
     python build.py saida.html
Para atualizar os dados a partir da planilha antes: python importar_planilha.py
"""
import json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(AQUI, 'base', 'htmlJoao.prototipo.html')
SAIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, '..', 'htmlJoao.html')


def ler(nome):
    return open(os.path.join(AQUI, nome), encoding='utf-8').read()


src = ler('telas.dc.html')
dados = json.dumps(json.loads(ler('dados_planilha.json')), ensure_ascii=False, separators=(',', ':'))
js = ler('logica.js').replace('__DADOS_PLANILHA__', dados.replace('</', '<\\/'), 1)
if '</script' in js:
    sys.exit('ERRO: logica.js não pode conter "</script"')
src = src.replace('/*LOGICA*/', js, 1)
orig = open(BASE, encoding='utf-8').read()

TPL_OPEN = '<script type="__bundler/template">\n'
a = orig.index(TPL_OPEN) + len(TPL_OPEN)
b = orig.index('\n  </script>', a)
old_tpl = json.loads(orig[a:b])

# cabeçalho + fontes embutidas (tudo até o fim do <style> das @font-face)
prefix = old_tpl[:old_tpl.index('</style>') + len('</style>')]

m = re.search(r'<link href="https://fonts\.googleapis\.com/css2[^>]*>\n', src)
body = src[m.end():src.index('</x-dc>')]
sm = re.search(r'<script type="text/x-dc" data-dc-script[^>]*>', src)
logic = src[sm.end():src.index('</script>', sm.end())]

BLOBS = {
    '/_blob/782c0d9d9871409c3b583dd7eb890642': '14b40702-0ea1-4407-bd2d-31a7ea5c09f5',  # logo JG branca
    '/_blob/983c1ce21e2d68ab9d4c480ec8bafaad': 'aea9947c-6a04-4c2e-b14e-04c808c62d46',  # logo JG marinho
}
for k, v in BLOBS.items():
    body = body.replace(k, v)
body = body.replace('<div class="app">', '<div class="app" data-canvas-width="1440" data-canvas-height="1180" data-document-role="page" data-label="Sistema Estoque &amp; CMV">', 1)

# o parser HTML descarta/move tabelas e selects dentro dos templates: o runtime usa sc-raw-*
body = re.sub(r'<(/?)(table|thead|tbody|tfoot|tr|td|th|select|caption)(?=[\s>/])', r'<\1sc-raw-\2', body)


def kebab(name):
    return 'sc-camel-' + re.sub(r'([A-Z])', lambda x: '-' + x.group(1).lower(), name)


def fix_tag(t):
    t = t.group(0)
    # atributos camelCase (onClick, onChange, viewBox...) viram sc-camel-*
    t = re.sub(r'(\s)([a-z]+[A-Z][A-Za-z]*)(?==)', lambda x: x.group(1) + kebab(x.group(2)), t)
    # atributos booleanos sem valor viram ="" (como o DOMParser serializa)
    t = re.sub(r'(\s)(readonly|disabled|checked|multiple|selected|data-dc-script)(?=[\s>/])(?!=)', r'\1\2=""', t)
    return t


body = re.sub(r'<[a-zA-Z][^<>]*>', fix_tag, body)

new_tpl = (prefix + '\n' + body + '</x-dc>\n'
           '<script type="text/x-dc" data-dc-script="" data-props="{&quot;$preview&quot;:{&quot;width&quot;:1440,&quot;height&quot;:1180}}">'
           + logic + '</script>\n\n\n</body></html>')

enc = json.dumps(new_tpl, ensure_ascii=False).replace('</', '<\\u002F')
out = orig[:a] + enc + orig[b:]
title = re.search(r'<title>(.*?)</title>', src).group(1)
out = re.sub(r'<title>.*?</title>', '<title>' + title + '</title>', out, count=1)
out = re.sub(r'(<div id="__bundler_placeholder">Loading ).*?(\.\.\.</div>)', lambda x: x.group(1) + title + x.group(2), out, count=1)
open(SAIDA, 'w', encoding='utf-8', newline='\n').write(out)
print('ok ->', os.path.abspath(SAIDA), '(%d KB)' % (len(out.encode('utf-8')) // 1024))
