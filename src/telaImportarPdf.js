import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ITENS_PADRAO, EMPRESAS } from './config.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* ---------- Ponto de entrada ---------- */

/**
 * Lê um arquivo PDF de Verificação Técnica Operacional da R&L e devolve
 * os dados estruturados prontos para revisão/gravação.
 *
 * Retorna:
 * {
 *   empresa: 'TC' | 'YUKA' | null,
 *   data: 'YYYY-MM-DD' | '',
 *   horarioInicio: string,
 *   responsavelVerificacao: string,
 *   itens: [{ numero, nome, status: 'C' | 'NC' | null }],
 *   naoConformidades: [{
 *     ncNumero, numero_item, nome_item, descricao, acaoCorretiva, prioridade, fotos: []
 *   }],
 *   avisos: string[]  // problemas encontrados durante o parsing, pra mostrar na revisão
 * }
 */
export async function importarPdfRL(arquivo) {
  const bufferArray = await arquivo.arrayBuffer();
  const textoCompleto = await extrairTextoPdf(bufferArray);

  const avisos = [];

  const cabecalho = parseCabecalho(textoCompleto, avisos);
  const itens = parseItens(textoCompleto, avisos);
  const naoConformidades = parseNaoConformidades(textoCompleto, itens, avisos);

  return {
    ...cabecalho,
    itens,
    naoConformidades,
    avisos
  };
}

/* ---------- Extração de texto (pdf.js) ---------- */

async function extrairTextoPdf(bufferArray) {
  const documento = await pdfjsLib.getDocument({ data: bufferArray }).promise;
  let textoCompleto = '';

  for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
    const pagina = await documento.getPage(numeroPagina);
    const conteudo = await pagina.getTextContent();

    let yAnterior = null;
    for (const item of conteudo.items) {
      const y = item.transform[5];
      if (yAnterior !== null && Math.abs(y - yAnterior) > 2) {
        textoCompleto += '\n';
      } else if (textoCompleto && !/[\n\s]$/.test(textoCompleto)) {
        textoCompleto += ' ';
      }
      textoCompleto += item.str;
      yAnterior = y;
    }
    textoCompleto += '\n';
  }

  // remove o rodapé que se repete em toda página
  textoCompleto = textoCompleto.replace(
    /R&L Soluções Serviços e Treinamento Profissional Ltda\.[^\n]*Página\s*\d+\s*de\s*\d+/gi,
    '\n'
  );

  return textoCompleto;
}

/* ---------- Cabeçalho ---------- */

function parseCabecalho(texto, avisos) {
  let empresa = null;
  if (/YUKA/i.test(texto)) {
    empresa = EMPRESAS.find(e => e === 'YUKA') || null;
  } else if (/\bTC\b/i.test(texto)) {
    empresa = EMPRESAS.find(e => e === 'TC') || null;
  }
  if (!empresa) {
    avisos.push('Não foi possível identificar a empresa automaticamente. Confira antes de salvar.');
  }

  const matchData = texto.match(
    /Data\s+(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*In[ií]cio\s+(\d{2}:\d{2})\s*\|\s*Verifica[cç][aã]o por\s+([^\n]+)/i
  );

  let data = '';
  let horarioInicio = '';
  let responsavelVerificacao = '';

  if (matchData) {
    const [, dia, mes, ano, horario, responsavel] = matchData;
    data = `${ano}-${mes}-${dia}`;
    horarioInicio = horario;
    responsavelVerificacao = responsavel.trim();
  } else {
    avisos.push('Não foi possível ler a linha de data/horário/responsável. Preencha manualmente.');
  }

  return { empresa, data, horarioInicio, responsavelVerificacao };
}

/* ---------- Itens de inspeção (status C/NC) ---------- */

function parseItens(texto, avisos) {
  const itens = ITENS_PADRAO.map(i => ({ ...i, status: null }));

  const inicio = texto.search(/ITENS DE INSPE[ÇC][AÃ]O/i);
  const fim = texto.search(/PLANO DE A[ÇC][AÃ]O/i);
  if (inicio === -1 || fim === -1 || fim <= inicio) {
    avisos.push('Não foi possível localizar o bloco "Itens de Inspeção" no PDF.');
    return itens;
  }

  const blocoItens = texto.slice(inicio, fim).replace(/\s+/g, ' ').trim();

  const marcadores = [];
  const regexNumero = /\b(0[1-9]|1[0-6])\b/g;
  let m;
  while ((m = regexNumero.exec(blocoItens))) {
    marcadores.push({ numero: parseInt(m[1], 10), inicio: m.index, fim: m.index + m[0].length });
  }

  const statusPorNumero = {};
  for (let i = 0; i < marcadores.length; i++) {
    const atual = marcadores[i];
    if (statusPorNumero[atual.numero]) continue; // já capturado
    const proximo = marcadores[i + 1];
    const trecho = blocoItens.slice(atual.fim, proximo ? proximo.inicio : blocoItens.length);
    const matchStatus = trecho.trim().match(/\b([SI])\s*$/);
    if (matchStatus) {
      statusPorNumero[atual.numero] = matchStatus[1];
    }
  }

  itens.forEach(item => {
    const letra = statusPorNumero[item.numero];
    if (letra === 'S') {
      item.status = 'C';
    } else if (letra === 'I') {
      item.status = 'NC';
    } else {
      avisos.push(`Item ${String(item.numero).padStart(2, '0')} (${item.nome}) não foi encontrado no PDF — confira manualmente.`);
    }
  });

  return itens;
}

/* ---------- Plano de ação (não conformidades) ---------- */

function parseNaoConformidades(texto, itens, avisos) {
  const inicio = texto.search(/PLANO DE A[ÇC][AÃ]O/i);
  if (inicio === -1) {
    avisos.push('Não foi possível localizar o bloco "Plano de Ação" no PDF.');
    return [];
  }

  let blocoNCs = texto.slice(inicio);

  // corta a área de assinatura no final, se existir
  blocoNCs = blocoNCs.replace(/\n[^\n]*Respons[aá]vel pelo cliente[\s\S]*$/i, '');

  const regexNC = /NC\s*(\d+)\s+Itens?\s*(\d+)\s+(ALTA|M[ÉE]DIA|BAIXA)([\s\S]*?)(?=NC\s*\d+\s+Itens?\s*\d+\s+(?:ALTA|M[ÉE]DIA|BAIXA)|$)/gi;

  const naoConformidades = [];
  let m;
  while ((m = regexNC.exec(blocoNCs))) {
    const [, ncNumero, numeroItemStr, prioridade, corpo] = m;
    const numeroItem = parseInt(numeroItemStr, 10);

    const corpoLimpo = corpo.replace(/\s+/g, ' ').trim();
    const partes = corpoLimpo.split(/\bAC:\s*/i);
    const descricao = (partes[0] || '').trim();
    const acaoCorretiva = (partes[1] || '').trim();

    if (!acaoCorretiva) {
      avisos.push(`NC ${ncNumero} (item ${numeroItemStr}): não encontrei o texto "AC:" — confira a ação corretiva manualmente.`);
    }

    const itemCorrespondente = itens.find(i => i.numero === numeroItem);
    if (!itemCorrespondente) {
      avisos.push(`NC ${ncNumero} referencia o item ${numeroItemStr}, que não existe na lista de 16 itens padrão.`);
    }

    naoConformidades.push({
      ncNumero: parseInt(ncNumero, 10),
      numero_item: numeroItem,
      nome_item: itemCorrespondente ? itemCorrespondente.nome : `Item ${numeroItemStr}`,
      descricao,
      acaoCorretiva,
      prioridade: normalizarPrioridade(prioridade),
      fotos: [] // extração de imagens será adicionada em uma próxima etapa
    });
  }

  if (naoConformidades.length === 0) {
    avisos.push('Nenhuma não conformidade foi reconhecida no bloco "Plano de Ação". Confira se o PDF tem esse formato.');
  }

  return naoConformidades;
}

function normalizarPrioridade(prioridade) {
  const maiuscula = prioridade.toUpperCase();
  if (maiuscula.startsWith('M')) return 'MÉDIA';
  return maiuscula; // ALTA ou BAIXA
}
