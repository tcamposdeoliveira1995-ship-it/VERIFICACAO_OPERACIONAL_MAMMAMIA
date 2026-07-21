import { listarVerificacoes, listarNaoConformidades } from './api.js';
import { EMPRESAS, ITENS_PADRAO } from './config.js';

const TOTAL_ITENS_CHECKLIST = ITENS_PADRAO.length;

export function criarEstadoDash() {
  return {
    verificacoes: [],
    ncs: [],
    carregando: true
  };
}

export async function montarTelaDash(container, estado, salvarEstado) {
  container.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'conteudo';
  div.innerHTML = `
    <h2 style="margin-bottom:4px;">Dash</h2>
    <p style="color:var(--cor-texto-suave);margin-bottom:20px;font-size:13px;">Visão geral de todas as verificações</p>
    <div id="dash-conteudo"></div>
  `;
  container.appendChild(div);

  const conteudo = div.querySelector('#dash-conteudo');

  if (estado.carregando) {
    conteudo.innerHTML = `<div class="estado-vazio">Carregando...</div>`;
    try {
      const [verificacoes, ncs] = await Promise.all([
        listarVerificacoes({}),
        listarNaoConformidades()
      ]);
      estado.verificacoes = Array.isArray(verificacoes) ? verificacoes : [];
      estado.ncs = Array.isArray(ncs) ? ncs : [];
    } catch (e) {
      estado.verificacoes = [];
      estado.ncs = [];
    }
    estado.carregando = false;
    salvarEstado(estado);
    return;
  }

  renderDash(conteudo, estado);
}

function renderDash(container, estado) {
  const { verificacoes, ncs } = estado;

  if (verificacoes.length === 0) {
    container.innerHTML = `<div class="estado-vazio">Nenhuma verificação registrada ainda.</div>`;
    return;
  }

  const totalVerificacoes = verificacoes.length;
  const totalItensPossiveis = totalVerificacoes * TOTAL_ITENS_CHECKLIST;
  const totalNCs = ncs.length;
  const conformidadeGeral = totalItensPossiveis > 0
    ? ((totalItensPossiveis - totalNCs) / totalItensPossiveis) * 100
    : 100;

  const ncsAbertas = ncs.filter(nc => !nc.data_realizada);
  const ncsResolvidas = ncs.filter(nc => !!nc.data_realizada);

  const temposResolucao = ncsResolvidas
    .map(nc => diasEntre(nc.data, nc.data_realizada))
    .filter(dias => dias !== null && dias >= 0);
  const tempoMedioResolucao = temposResolucao.length > 0
    ? temposResolucao.reduce((a, b) => a + b, 0) / temposResolucao.length
    : null;

  container.innerHTML = '';

  /* ---------- Cards (KPIs) ---------- */
  const cards = document.createElement('div');
  cards.style.display = 'grid';
  cards.style.gridTemplateColumns = 'repeat(auto-fit, minmax(130px, 1fr))';
  cards.style.gap = '10px';
  cards.style.marginBottom = '28px';
  cards.innerHTML = [
    montarCardHtml('Verificações', totalVerificacoes, ''),
    montarCardHtml('Conformidade geral', conformidadeGeral.toFixed(0), '%', conformidadeGeral >= 80 ? 'var(--cor-conforme)' : 'var(--cor-nao-conforme)'),
    montarCardHtml('NCs abertas', ncsAbertas.length, '', ncsAbertas.length > 0 ? 'var(--cor-nao-conforme)' : 'var(--cor-conforme)'),
    montarCardHtml('NCs resolvidas', ncsResolvidas.length, '', 'var(--cor-conforme)'),
    montarCardHtml('Tempo médio p/ resolver', tempoMedioResolucao !== null ? tempoMedioResolucao.toFixed(1) : '-', tempoMedioResolucao !== null ? ' dias' : '')
  ].join('');
  container.appendChild(cards);

  /* ---------- Linha do tempo: conformidade por mês ---------- */
  const pontosTempo = calcularConformidadePorMes(verificacoes, ncs);
  const blocoTempo = document.createElement('div');
  blocoTempo.className = 'cartao-item';
  blocoTempo.style.marginBottom = '20px';
  blocoTempo.innerHTML = `<div style="font-size:14px;font-weight:600;margin-bottom:12px;">Conformidade ao longo do tempo</div>`;
  if (pontosTempo.length < 2) {
    blocoTempo.innerHTML += `<div class="estado-vazio">Ainda não há dados suficientes pra montar a linha do tempo (precisa de pelo menos 2 meses).</div>`;
  } else {
    blocoTempo.innerHTML += svgLinhaTempo(pontosTempo);
  }
  container.appendChild(blocoTempo);

  /* ---------- Comparação entre empresas ---------- */
  const porEmpresa = EMPRESAS.map(empresa => {
    const verificacoesEmpresa = verificacoes.filter(v => v.empresa === empresa);
    const ncsEmpresa = ncs.filter(nc => nc.empresa === empresa);
    const totalItens = verificacoesEmpresa.length * TOTAL_ITENS_CHECKLIST;
    const conformidade = totalItens > 0 ? ((totalItens - ncsEmpresa.length) / totalItens) * 100 : 100;
    return { label: empresa, valor: Math.round(conformidade * 10) / 10, totalNCs: ncsEmpresa.length, totalVerificacoes: verificacoesEmpresa.length };
  }).filter(e => e.totalVerificacoes > 0);

  const blocoEmpresas = document.createElement('div');
  blocoEmpresas.className = 'cartao-item';
  blocoEmpresas.style.marginBottom = '20px';
  blocoEmpresas.innerHTML = `<div style="font-size:14px;font-weight:600;margin-bottom:12px;">Comparação entre empresas (% de conformidade)</div>`;
  if (porEmpresa.length === 0) {
    blocoEmpresas.innerHTML += `<div class="estado-vazio">Sem dados.</div>`;
  } else {
    blocoEmpresas.innerHTML += svgBarrasHorizontais(porEmpresa, {
      maxValor: 100,
      cor: item => item.valor >= 80 ? 'var(--cor-conforme)' : 'var(--cor-nao-conforme)',
      formatarValor: item => `${item.valor}% · ${item.totalNCs} NC${item.totalNCs !== 1 ? 's' : ''} em ${item.totalVerificacoes} visita${item.totalVerificacoes !== 1 ? 's' : ''}`
    });
  }
  container.appendChild(blocoEmpresas);

  /* ---------- Itens que mais reprovam ---------- */
  const porItem = {};
  ncs.forEach(nc => {
    const chave = nc.numero_item;
    if (!porItem[chave]) {
      porItem[chave] = { numero: nc.numero_item, nome: nc.nome_item, total: 0 };
    }
    porItem[chave].total += 1;
  });
  const rankingItens = Object.values(porItem)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map(i => ({
      label: `${String(i.numero).padStart(2, '0')}. ${truncar(i.nome, 42)}`,
      valor: i.total
    }));

  const blocoItens = document.createElement('div');
  blocoItens.className = 'cartao-item';
  blocoItens.innerHTML = `<div style="font-size:14px;font-weight:600;margin-bottom:12px;">Itens que mais reprovam</div>`;
  if (rankingItens.length === 0) {
    blocoItens.innerHTML += `<div class="estado-vazio">Nenhuma não conformidade registrada. 🎉</div>`;
  } else {
    blocoItens.innerHTML += svgBarrasHorizontais(rankingItens, {
      cor: () => 'var(--cor-dourado)',
      formatarValor: item => `${item.valor}× NC`
    });
  }
  container.appendChild(blocoItens);
}

/* ===================== Cálculos ===================== */

function diasEntre(dataInicioISO, dataFimISO) {
  if (!dataInicioISO || !dataFimISO) return null;
  const inicio = new Date(dataInicioISO + 'T00:00:00');
  const fim = new Date(dataFimISO + 'T00:00:00');
  if (isNaN(inicio) || isNaN(fim)) return null;
  return Math.round((fim - inicio) / (1000 * 60 * 60 * 24));
}

function calcularConformidadePorMes(verificacoes, ncs) {
  const verificacoesPorMes = {};
  verificacoes.forEach(v => {
    if (!v.data) return;
    const mes = v.data.slice(0, 7);
    verificacoesPorMes[mes] = (verificacoesPorMes[mes] || 0) + 1;
  });

  const ncsPorMes = {};
  ncs.forEach(nc => {
    if (!nc.data) return;
    const mes = nc.data.slice(0, 7);
    ncsPorMes[mes] = (ncsPorMes[mes] || 0) + 1;
  });

  const meses = Object.keys(verificacoesPorMes).sort();

  return meses.map(mes => {
    const totalVerificacoes = verificacoesPorMes[mes];
    const totalItens = totalVerificacoes * TOTAL_ITENS_CHECKLIST;
    const totalNCs = ncsPorMes[mes] || 0;
    const conformidade = totalItens > 0 ? ((totalItens - totalNCs) / totalItens) * 100 : 100;
    const [ano, mesNum] = mes.split('-');
    return { label: `${mesNum}/${ano}`, valor: Math.round(conformidade * 10) / 10 };
  });
}

/* ===================== Componentes visuais (SVG, sem dependências) ===================== */

function montarCardHtml(titulo, valor, sufixo, cor) {
  return `
    <div class="cartao-item" style="text-align:center;padding:14px 10px;">
      <div style="font-size:22px;font-weight:700;color:${cor || 'var(--cor-texto)'};font-family:var(--fonte-display);">${valor}${sufixo}</div>
      <div style="font-size:11px;color:var(--cor-texto-suave);margin-top:4px;">${titulo}</div>
    </div>
  `;
}

function svgLinhaTempo(pontos) {
  const largura = 340;
  const altura = 150;
  const margemBaixo = 22;
  const margemTopo = 14;
  const margemLados = 26;
  const areaAltura = altura - margemBaixo - margemTopo;
  const areaLargura = largura - margemLados * 2;

  const passoX = pontos.length > 1 ? areaLargura / (pontos.length - 1) : 0;
  const coords = pontos.map((p, i) => ({
    x: margemLados + i * passoX,
    y: margemTopo + areaAltura - (Math.max(0, Math.min(100, p.valor)) / 100) * areaAltura,
    ...p
  }));

  const linha = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  let svg = `<svg viewBox="0 0 ${largura} ${altura}" width="100%" style="display:block;overflow:visible;">`;
  [0, 50, 100].forEach(marca => {
    const y = margemTopo + areaAltura - (marca / 100) * areaAltura;
    svg += `<line x1="${margemLados}" y1="${y}" x2="${largura - margemLados}" y2="${y}" stroke="var(--cor-borda)" stroke-width="0.6" />`;
    svg += `<text x="0" y="${y + 3}" font-size="8" fill="var(--cor-texto-fraco)">${marca}%</text>`;
  });
  svg += `<polyline points="${linha}" fill="none" stroke="var(--cor-dourado)" stroke-width="2" />`;
  coords.forEach(c => {
    svg += `<circle cx="${c.x}" cy="${c.y}" r="3.2" fill="var(--cor-dourado)" />`;
    svg += `<text x="${c.x}" y="${c.y - 8}" font-size="8.5" fill="var(--cor-texto)" text-anchor="middle" font-weight="600">${c.valor}%</text>`;
    svg += `<text x="${c.x}" y="${altura - 4}" font-size="8" fill="var(--cor-texto-suave)" text-anchor="middle">${c.label}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function svgBarrasHorizontais(itens, opcoes = {}) {
  const largura = 340;
  const alturaBarra = 9;
  const espacoItem = 30;
  const max = opcoes.maxValor || Math.max(...itens.map(i => i.valor), 1);
  const alturaSvg = itens.length * espacoItem + 4;

  let svg = `<svg viewBox="0 0 ${largura} ${alturaSvg}" width="100%" style="display:block;">`;
  itens.forEach((item, i) => {
    const y = i * espacoItem;
    const larguraMaxBarra = largura - 4;
    const larguraBarra = Math.max((item.valor / max) * larguraMaxBarra, 3);
    const cor = opcoes.cor ? opcoes.cor(item, i) : 'var(--cor-dourado)';
    const valorFormatado = opcoes.formatarValor ? opcoes.formatarValor(item) : item.valor;
    svg += `
      <text x="0" y="${y + 9}" font-size="10.5" fill="var(--cor-texto)" font-family="var(--fonte-corpo)">${escaparTexto(item.label)}</text>
      <rect x="0" y="${y + 13}" width="${larguraMaxBarra}" height="${alturaBarra}" rx="3" fill="var(--cor-superficie-alta)"></rect>
      <rect x="0" y="${y + 13}" width="${larguraBarra}" height="${alturaBarra}" rx="3" fill="${cor}"></rect>
      <text x="0" y="${y + 13 + alturaBarra + 9}" font-size="9" fill="var(--cor-texto-suave)">${escaparTexto(String(valorFormatado))}</text>
    `;
  });
  svg += `</svg>`;
  return svg;
}

function truncar(texto, tamanho) {
  if (!texto) return '';
  return texto.length > tamanho ? texto.slice(0, tamanho - 1) + '…' : texto;
}

function escaparTexto(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
