// Usa o build "legacy" do pdf.js: a build padrão assume uma API de Map
// (Map.prototype.getOrInsertComputed) que ainda não existe nos navegadores
// atuais e quebra a extração de imagens (getOperatorList) em runtime.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
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
 *     ncNumero, numero_item, nome_item, descricao, acaoCorretiva, prioridade,
 *     fotos: string[]  // data URLs das fotos extraídas do PDF para essa NC
 *   }],
 *   avisos: string[]  // problemas encontrados durante o parsing, pra mostrar na revisão
 * }
 */
export async function importarPdfRL(arquivo) {
  const bufferArray = await arquivo.arrayBuffer();
  const documento = await pdfjsLib.getDocument({ data: bufferArray }).promise;

  const avisos = [];

  const { textoCompleto, marcadoresNC } = await extrairTextoEMarcadores(documento);
  const imagens = await extrairImagensPdf(documento);

  const cabecalho = parseCabecalho(textoCompleto, avisos);
  const itens = parseItens(textoCompleto, avisos);
  const naoConformidades = parseNaoConformidades(textoCompleto, itens, avisos);

  associarFotosAsNaoConformidades(naoConformidades, marcadoresNC, imagens, avisos);

  return {
    ...cabecalho,
    itens,
    naoConformidades,
    avisos
  };
}

/* ---------- Extração de texto (pdf.js) ---------- */

/**
 * Extrai o texto completo do PDF (mesma lógica de sempre) e, de quebra,
 * anota em que página/altura (y) cada linha "NC N Item M ..." aparece —
 * essa posição é usada depois para descobrir a quais NC pertence cada
 * foto encontrada no PDF.
 */
async function extrairTextoEMarcadores(documento) {
  let textoCompleto = '';
  const marcadoresNC = []; // [{ pagina, y, ncNumero }]

  for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
    const pagina = await documento.getPage(numeroPagina);
    const conteudo = await pagina.getTextContent();

    let linhaAtual = '';
    let yLinhaAtual = null;
    let yAnterior = null;

    const finalizarLinha = () => {
      const matchMarcador = linhaAtual.match(/NC\s*(\d+)\s+Itens?\s*\d+\s+(?:ALTA|M[ÉE]DIA|BAIXA)/i);
      if (matchMarcador) {
        marcadoresNC.push({ pagina: numeroPagina, y: yLinhaAtual, ncNumero: parseInt(matchMarcador[1], 10) });
      }
    };

    for (const item of conteudo.items) {
      const y = item.transform[5];
      if (yAnterior !== null && Math.abs(y - yAnterior) > 2) {
        finalizarLinha();
        textoCompleto += '\n';
        linhaAtual = '';
        yLinhaAtual = y;
      } else if (textoCompleto && !/[\n\s]$/.test(textoCompleto)) {
        textoCompleto += ' ';
      }
      if (yLinhaAtual === null) yLinhaAtual = y;
      textoCompleto += item.str;
      linhaAtual += item.str;
      yAnterior = y;
    }
    finalizarLinha();
    textoCompleto += '\n';
  }

  // remove o rodapé que se repete em toda página
  textoCompleto = textoCompleto.replace(
    /R&L Soluções Serviços e Treinamento Profissional Ltda\.[^\n]*Página\s*\d+\s*de\s*\d+/gi,
    '\n'
  );

  return { textoCompleto, marcadoresNC };
}

/* ---------- Extração de imagens (fotos das NCs) ---------- */

const LARGURA_MINIMA_FOTO = 50;
const ALTURA_MINIMA_FOTO = 50;

function multiplicarMatrizes(matrizAplicada, matrizBase) {
  return [
    matrizAplicada[0] * matrizBase[0] + matrizAplicada[1] * matrizBase[2],
    matrizAplicada[0] * matrizBase[1] + matrizAplicada[1] * matrizBase[3],
    matrizAplicada[2] * matrizBase[0] + matrizAplicada[3] * matrizBase[2],
    matrizAplicada[2] * matrizBase[1] + matrizAplicada[3] * matrizBase[3],
    matrizAplicada[4] * matrizBase[0] + matrizAplicada[5] * matrizBase[2] + matrizBase[4],
    matrizAplicada[4] * matrizBase[1] + matrizAplicada[5] * matrizBase[3] + matrizBase[5]
  ];
}

function obterObjetoDaPagina(pagina, nomeObjeto) {
  return new Promise(resolve => pagina.objs.get(nomeObjeto, resolve));
}

/* Converte o objeto de imagem devolvido pelo pdf.js (pode vir já decodificado
   como imagem "pronta" ou como matriz de pixels crua) em data URL JPEG. */
function imagemParaDataUrl(objeto) {
  if (!objeto) return null;

  const largura = objeto.width;
  const altura = objeto.height;
  if (!largura || !altura || largura < LARGURA_MINIMA_FOTO || altura < ALTURA_MINIMA_FOTO) return null;

  // Em navegadores com WebCodecs, o pdf.js decodifica JPEGs como VideoFrame
  // (em objeto.bitmap) em vez de devolver os pixels crus em objeto.data.
  const fonteDesenhavel =
    objeto.bitmap ||
    ((typeof HTMLImageElement !== 'undefined' && objeto instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement !== 'undefined' && objeto instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap !== 'undefined' && objeto instanceof ImageBitmap)
      ? objeto
      : null);

  if (fonteDesenhavel) {
    // Não fecha/descarta fonteDesenhavel: o pdf.js cacheia esse mesmo objeto
    // por nome e pode reutilizá-lo (ex: a mesma imagem referenciada mais de
    // uma vez no PDF) — fechá-lo aqui quebraria esses outros usos.
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(fonteDesenhavel, 0, 0, largura, altura);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  const { data } = objeto;
  if (!data) return null;

  const totalPixels = largura * altura;
  const canaisPorPixel = data.length / totalPixels;
  if (![1, 3, 4].includes(canaisPorPixel)) return null; // formato não suportado (ex: CMYK)

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(largura, altura);
  const destino = imageData.data;

  if (canaisPorPixel === 4) {
    destino.set(data);
  } else if (canaisPorPixel === 3) {
    for (let p = 0; p < totalPixels; p++) {
      destino[p * 4] = data[p * 3];
      destino[p * 4 + 1] = data[p * 3 + 1];
      destino[p * 4 + 2] = data[p * 3 + 2];
      destino[p * 4 + 3] = 255;
    }
  } else {
    for (let p = 0; p < totalPixels; p++) {
      const cinza = data[p];
      destino[p * 4] = cinza;
      destino[p * 4 + 1] = cinza;
      destino[p * 4 + 2] = cinza;
      destino[p * 4 + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/* Percorre a lista de operadores de cada página rastreando a matriz de
   transformação corrente (via save/restore/transform) para saber em que
   altura (y) cada imagem foi desenhada — isso é o que permite depois ligar
   cada foto à não conformidade certa. */
async function extrairImagensPdf(documento) {
  const imagens = []; // [{ pagina, y, dataUrl }]

  for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
    const pagina = await documento.getPage(numeroPagina);
    const opList = await pagina.getOperatorList();

    const pilhaMatrizes = [];
    let matrizAtual = [1, 0, 0, 1, 0, 0];

    for (let i = 0; i < opList.fnArray.length; i++) {
      const operacao = opList.fnArray[i];
      const argumentos = opList.argsArray[i];

      if (operacao === pdfjsLib.OPS.save) {
        pilhaMatrizes.push(matrizAtual);
      } else if (operacao === pdfjsLib.OPS.restore) {
        matrizAtual = pilhaMatrizes.pop() || matrizAtual;
      } else if (operacao === pdfjsLib.OPS.transform) {
        matrizAtual = multiplicarMatrizes(argumentos, matrizAtual);
      } else if (operacao === pdfjsLib.OPS.paintImageXObject) {
        try {
          const objeto = await obterObjetoDaPagina(pagina, argumentos[0]);
          const dataUrl = imagemParaDataUrl(objeto);
          if (dataUrl) {
            imagens.push({ pagina: numeroPagina, y: matrizAtual[5], dataUrl });
          }
        } catch (e) {
          // imagem em formato que não conseguimos decodificar — ignora e segue
        }
      }
    }
  }

  return imagens;
}

/* Ordem de leitura do documento: página cresce mais rápido que a posição
   dentro da página, e dentro da página quem está mais acima (y maior) vem
   primeiro. */
function posicaoDeLeitura(pagina, y) {
  return pagina * 1e6 - y;
}

/* Liga cada foto encontrada no PDF à não conformidade cujo marcador
   ("NC N Item M ...") aparece imediatamente antes dela na ordem de leitura
   do documento — é assim que o PDF da R&L organiza a evidência fotográfica
   (fotos vêm logo abaixo do texto da NC a que pertencem). */
function associarFotosAsNaoConformidades(naoConformidades, marcadoresNC, imagens, avisos) {
  if (imagens.length === 0) return;

  if (marcadoresNC.length === 0) {
    avisos.push(`O PDF tem ${imagens.length} imagem(ns), mas não foi possível localizar os marcadores de NC para saber a qual item cada uma pertence. Anexe as fotos manualmente na revisão.`);
    return;
  }

  const marcadoresOrdenados = marcadoresNC
    .map(m => ({ ...m, posicao: posicaoDeLeitura(m.pagina, m.y) }))
    .sort((a, b) => a.posicao - b.posicao);

  let fotosNaoAssociadas = 0;

  imagens.forEach(imagem => {
    const posicaoImagem = posicaoDeLeitura(imagem.pagina, imagem.y);

    let candidato = null;
    for (const marcador of marcadoresOrdenados) {
      if (marcador.posicao > posicaoImagem) break;
      candidato = marcador;
    }

    if (!candidato) {
      // Nenhum marcador de NC antes dela no documento inteiro — é uma imagem
      // do cabeçalho/logo (ex: o logo "R&L Qualidade"), não uma foto de
      // evidência. Ignora silenciosamente, sem contar como "não associada".
      return;
    }

    const nc = naoConformidades.find(n => n.ncNumero === candidato.ncNumero);
    if (nc) {
      nc.fotos.push(imagem.dataUrl);
    } else {
      fotosNaoAssociadas++;
    }
  });

  if (fotosNaoAssociadas > 0) {
    avisos.push(`${fotosNaoAssociadas} foto(s) do PDF não puderam ser ligadas a uma não conformidade específica. Confira e anexe manualmente na revisão, se necessário.`);
  }
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
      fotos: [] // preenchido depois por associarFotosAsNaoConformidades()
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
