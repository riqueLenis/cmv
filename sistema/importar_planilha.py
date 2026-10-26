"""Lê a planilha CONTROLE DE ESTOQUE E CMV (JG Consultoria) e gera dados_planilha.json,
que o build.py embute no sistema como dados iniciais.

uso: python importar_planilha.py [caminho.xlsx] [saida.json]
"""
import datetime, json, os, sys, warnings

import openpyxl

warnings.filterwarnings('ignore')
AQUI = os.path.dirname(os.path.abspath(__file__))
XLSX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, '..', 'planilha_referencia', 'CONTROLE_DE_ESTOQUE_E_CMV_-_JG_CONSULTORIA_v12.1.xlsx')
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, 'dados_planilha.json')

wb = openpyxl.load_workbook(XLSX)


def aba(prefixo):
    return wb[[s for s in wb.sheetnames if s.upper().startswith(prefixo)][0]]


def txt(v):
    if v is None:
        return ''
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%d/%m/%Y')
    if isinstance(v, float):
        return ('%.6f' % v).rstrip('0').rstrip('.').replace('.', ',')
    return str(v).strip()


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def cod_de(rotulo):
    """'025 · Arroz integral' -> '025'"""
    s = txt(rotulo)
    return s[:3] if len(s) >= 3 and s[:3].isdigit() else ''


# ---------- cadastro e categorias ----------
cad = aba('CADASTRO')
insumos = []
for r in range(9, 309):
    cod, nome = txt(cad.cell(r, 1).value), txt(cad.cell(r, 2).value)
    if not nome:
        continue
    insumos.append({
        'cod': cod, 'nome': nome, 'un': txt(cad.cell(r, 3).value) or 'kg',
        'rende': txt(cad.cell(r, 4).value) or '1', 'compra': txt(cad.cell(r, 5).value),
        'cat': txt(cad.cell(r, 7).value), 'naCont': 'Não' if txt(cad.cell(r, 9).value) == 'Não' else 'Sim',
    })
cats = []
for r in range(9, 19):
    n = txt(cad.cell(r, 10).value)
    if n:
        cats.append({'nome': n, 'cmv': txt(cad.cell(r, 11).value) == 'Sim'})

# ---------- configuração ----------
fech, cmc, est, rf = aba('FECHAMENTO'), aba('CMC'), aba('ESTOQUE'), aba('RESUMO FICHAS')


def pct_ou(v, padrao):
    return v if num(v) is not None else padrao


cfg = {
    'mes': txt(fech['C7'].value), 'metaMes': pct_ou(fech['C8'].value, 0.35), 'metaCmc': pct_ou(cmc['C11'].value, 0.35),
    'est': {'dias': pct_ou(est['C7'].value, 7), 'prazo': pct_ou(est['C8'].value, 2), 'margem': pct_ou(est['C9'].value, 0.2), 'cob': pct_ou(est['C10'].value, 7)},
    'apps': [{'nome': txt(rf.cell(9, c).value), 'com': num(rf.cell(10, c).value), 'pag': num(rf.cell(11, c).value)} for c in (4, 5)],
    'embCat': txt(rf['D13'].value) or 'Embalagem',
}

# ---------- semanas do CMV ----------
semanas, lanc, perd = [], [], []
for w in range(1, 6):
    ws = aba('CMV SEMANA %d' % w)
    sem = {'ini': txt(ws['C7'].value), 'fim': txt(ws['C8'].value), 'fat': txt(ws['C9'].value),
           'meta': num(ws['C10'].value) if num(ws['C10'].value) is not None else 0.35, 'rows': {}}
    for r in range(24, 324):
        cod = txt(ws.cell(r, 1).value)
        ini, fin = ws.cell(r, 7).value, ws.cell(r, 11).value
        row = {}
        if w == 1 and num(ini) is not None:
            row['ini'] = txt(ini)
        if num(fin) is not None:
            row['fin'] = txt(fin)
        if row:
            sem['rows'][cod] = row
        # entradas digitadas direto no CMV viram lançamentos de entrada na data inicial da semana
        for col in (8, 9):
            q = num(ws.cell(r, col).value)
            if q:
                lanc.append({'id': 'imp-e%d-%s-%d' % (w, cod, col), 'tipo': 'Entrada', 'data': sem['ini'], 'cod': cod, 'qtd': q, 'resp': 'Importado da planilha'})
    semanas.append(sem)

# ---------- produção e perdas (um bloco de 7 colunas por semana) ----------
prod_ws, perd_ws = aba('PRODU'), aba('PERDAS')
for w in range(5):
    c0 = 2 + 7 * w  # B, I, P, W, AD
    for r in range(12, 212):
        d, ins = prod_ws.cell(r, c0).value, cod_de(prod_ws.cell(r, c0 + 1).value)
        q = num(prod_ws.cell(r, c0 + 4).value)
        if ins and q:
            lanc.append({'id': 'imp-p%d-%d' % (w, r), 'tipo': 'Produção', 'data': txt(d) or semanas[w]['ini'], 'cod': ins, 'qtd': q, 'resp': txt(prod_ws.cell(r, c0 + 5).value)})
        d, ins = perd_ws.cell(r, c0).value, cod_de(perd_ws.cell(r, c0 + 1).value)
        q = num(perd_ws.cell(r, c0 + 3).value)
        if ins and q:
            perd.append({'id': 'imp-l%d-%d' % (w, r), 'data': txt(d) or semanas[w]['ini'], 'cod': ins, 'qtd': q, 'motivo': txt(perd_ws.cell(r, c0 + 4).value) or 'Outros'})

# ---------- CMC ----------
notas = []
for k, r in enumerate(range(40, 440)):
    d, v = cmc.cell(r, 2).value, num(cmc.cell(r, 6).value)
    if d is None and not v:
        continue
    notas.append({'id': 'imp-n%d' % k, 'data': txt(d), 'forn': txt(cmc.cell(r, 3).value), 'nf': txt(cmc.cell(r, 4).value),
                  'cat': txt(cmc.cell(r, 5).value), 'valor': txt(v), 'obs': txt(cmc.cell(r, 7).value)})
for w in range(5):  # faturamento digitado só no CMC
    if not semanas[w]['fat'] and num(cmc.cell(16 + w, 5).value):
        semanas[w]['fat'] = txt(cmc.cell(16 + w, 5).value)

# ---------- estoque mínimo: prazo por item ----------
prazo = {}
cmv1 = aba('CMV SEMANA 1')
for k in range(300):
    v = num(est.cell(15 + k, 13).value)
    if v:
        prazo[txt(cmv1.cell(24 + k, 1).value)] = txt(v)

# ---------- fichas técnicas ----------
fichas = []
for n in range(1, 101):
    ws = wb['FT %02d' % n]
    f = {
        'nome': txt(ws['B8'].value), 'cat': txt(ws['F8'].value), 'rev': txt(ws['H8'].value),
        'rend': txt(ws['H11'].value) or '1', 'peso': txt(ws['H12'].value), 'preco': txt(ws['H13'].value),
        'meta': num(ws['H14'].value) if num(ws['H14'].value) is not None else 0.3,
        'ings': [{'cod': cod_de(ws.cell(r, 3).value), 'q': txt(ws.cell(r, 6).value)} for r in range(28, 48)],
        'embs': [{'cod': cod_de(ws.cell(r, 3).value), 'q': txt(ws.cell(r, 6).value)} for r in range(52, 57)],
        'taxa': [txt(ws['G62'].value), txt(ws['H62'].value)], 'precoApp': [txt(ws['G64'].value), txt(ws['H64'].value)],
        'prep': [txt(ws.cell(r, 3).value) for r in range(71, 86)], 'obs': txt(ws['B88'].value),
    }
    vazia = not f['nome'] and not any(i['cod'] for i in f['ings'])
    fichas.append(None if vazia else f)

dados = {'origem': os.path.basename(XLSX), 'cfg': cfg, 'cats': cats, 'ins': insumos, 'weeks': semanas,
         'lanc': lanc, 'perd': perd, 'notas': notas, 'prazo': prazo, 'fichas': fichas}
json.dump(dados, open(SAIDA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('%d insumos, %d categorias, %d lançamentos, %d perdas, %d notas, %d fichas preenchidas -> %s' % (
    len(insumos), len(cats), len(lanc), len(perd), len(notas), sum(1 for f in fichas if f), SAIDA))
