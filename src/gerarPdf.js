import { jsPDF } from 'jspdf';

const COR_DOURADO = [201, 162, 39];
const COR_TEXTO = [30, 28, 24];
const COR_SUAVE = [110, 105, 96];
const COR_CONFORME = [60, 120, 85];
const COR_NAO_CONFORME = [180, 55, 45];
const COR_ALERTA = [201, 140, 39];
const COR_BORDA = [225, 219, 205];
// Status das NCs nos cartões do PDF: mesmas cores do app (--cor-nao-conforme / --cor-conforme em style.css)
const COR_PENDENTE = [184, 57, 47];        // #b8392f
const COR_PENDENTE_FUNDO = [253, 236, 236]; // #FDECEC
const COR_RESOLVIDA = [47, 122, 77];       // #2f7a4d

const REGEX_PREFIXO_PRIORIDADE = /^\[(ALTA|M[ÉE]DIA|BAIXA)\]\s*/i;
const COR_PRIORIDADE = { ALTA: COR_NAO_CONFORME, 'MÉDIA': COR_ALERTA, BAIXA: COR_SUAVE };

/* A prioridade vem embutida como prefixo "[ALTA] " no início do texto da ação
   corretiva (mesma convenção de src/telaPlanoAcao.js) — separamos aqui pra
   poder desenhar a prioridade como selo e mostrar o texto da ação sem o
   prefixo cru. */
function extrairPrioridade(acaoCorretiva) {
  const m = (acaoCorretiva || '').match(REGEX_PREFIXO_PRIORIDADE);
  if (!m) return '';
  const p = m[1].toUpperCase();
  return p.startsWith('M') ? 'MÉDIA' : p;
}

function removerPrefixoPrioridade(acaoCorretiva) {
  return (acaoCorretiva || '').replace(REGEX_PREFIXO_PRIORIDADE, '');
}

/* Remove emojis e outros símbolos fora do alfabeto que as fontes padrão do
   PDF conseguem desenhar (WinAnsi/Latin-1) — sem isso, um texto colado de
   outro sistema com emojis (ex: um resumo de Ordem de Serviço) vira uma
   sequência de caracteres quebrados no PDF. Também limpa os espaços e
   linhas em branco extras que sobram no lugar dos emojis removidos. */
function sanitizarTexto(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .split('\n')
    .map(linha => linha.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHoraBR(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('pt-BR');
}

/* ---------- Blocos de desenho reutilizados pelos dois PDFs ---------- */

function desenharCabecalho(doc, { margemEsquerda, larguraUtil, titulo, subtitulo }) {
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COR_DOURADO);
  doc.text('MAMMA MIA · R&L QUALIDADE', margemEsquerda, y);
  y += 7;

  doc.setFontSize(15);
  doc.setTextColor(...COR_TEXTO);
  // Título pode ser longo (ex.: com os filtros do Plano de Ação): quebra em mais linhas.
  // Se vier como lista de partes, só quebra entre partes ("A · B · C"), nunca no meio de uma.
  const linhasTitulo = Array.isArray(titulo) ? quebrarPorPartes(doc, titulo, larguraUtil) : doc.splitTextToSize(titulo, larguraUtil);
  doc.text(linhasTitulo, margemEsquerda, y);
  y += 6 + (linhasTitulo.length - 1) * 6.2;

  doc.setDrawColor(...COR_DOURADO);
  doc.setLineWidth(0.5);
  doc.line(margemEsquerda, y, margemEsquerda + larguraUtil, y);
  y += 6;

  if (subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COR_SUAVE);
    doc.text(subtitulo, margemEsquerda, y);
    y += 8;
  } else {
    y += 2;
  }
  return y;
}

/* Desenha um campo com um rótulo pequeno em cима e o valor logo embaixo, em
   vez do antigo formato "Rótulo: valor" tudo numa linha só — assim um valor
   comprido (ou colado com várias linhas, tipo um resumo de OS) quebra de
   forma legível, sem se misturar com o campo vizinho. Devolve o y seguinte. */
function desenharCampo(doc, { x, y, largura, rotulo, valor, vazio = 'Não definido', cor = COR_TEXTO, tamanho = 9.5, negrito = false, novaPaginaSeNecessario }) {
  const texto = sanitizarTexto(valor);
  const linhas = doc.splitTextToSize(texto || vazio, largura);
  const alturaLinha = tamanho * 0.46;
  const alturaTotal = 3.8 + linhas.length * alturaLinha;

  // novaPaginaSeNecessario devolve o y a usar (18 se abriu página nova).
  // Pede o campo inteiro; se ele sozinho for maior que ~1 página, pede só rótulo + 3 linhas.
  if (novaPaginaSeNecessario) {
    y = novaPaginaSeNecessario(alturaTotal <= 240 ? alturaTotal : 3.8 + 3 * alturaLinha, y);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...COR_SUAVE);
  doc.text(rotulo.toUpperCase(), x, y);

  doc.setFont('helvetica', negrito ? 'bold' : 'normal');
  doc.setFontSize(tamanho);
  doc.setTextColor(...(texto ? cor : COR_SUAVE));

  if (!novaPaginaSeNecessario) {
    doc.text(linhas, x, y + 4);
    return y + 4 + linhas.length * alturaLinha;
  }

  // Linha a linha: um texto muito longo continua na página seguinte em vez de vazar pelo rodapé
  let yLinha = y + 4;
  linhas.forEach(linha => {
    const yAntes = yLinha;
    yLinha = novaPaginaSeNecessario(alturaLinha, yLinha);
    if (yLinha !== yAntes) {
      yLinha += 3;
      doc.setFont('helvetica', negrito ? 'bold' : 'normal');
      doc.setFontSize(tamanho);
      doc.setTextColor(...(texto ? cor : COR_SUAVE));
    }
    doc.text(linha, x, yLinha);
    yLinha += alturaLinha;
  });
  return yLinha;
}

function desenharSelo(doc, texto, x, y, cor, alinharDireita) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...cor);
  doc.text(texto, x, y, alinharDireita ? { align: 'right' } : undefined);
}

function desenharFotos(doc, { x, y, largura, fotosBase64, novaPaginaSeNecessario, rotulo }) {
  if (!fotosBase64 || fotosBase64.length === 0) return y;

  const larguraFoto = 30;
  const alturaFoto = 30;
  const espacoFoto = 4;
  const fotosPorLinha = Math.max(1, Math.floor(largura / (larguraFoto + espacoFoto)));

  if (novaPaginaSeNecessario) y = novaPaginaSeNecessario(alturaFoto + 8, y);

  if (rotulo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...COR_SUAVE);
    doc.text(rotulo.toUpperCase(), x, y);
    y += 4;
  }

  let xFoto = x;
  let contadorNaLinha = 0;
  let yAtual = y;

  fotosBase64.forEach(base64 => {
    if (contadorNaLinha >= fotosPorLinha) {
      xFoto = x;
      contadorNaLinha = 0;
      yAtual += alturaFoto + espacoFoto;
      if (novaPaginaSeNecessario) yAtual = novaPaginaSeNecessario(alturaFoto + 4, yAtual);
    }
    try {
      const formato = base64.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(base64, formato, xFoto, yAtual, larguraFoto, alturaFoto);
    } catch (err) {
      // se uma imagem específica falhar, segue sem travar o PDF inteiro
    }
    xFoto += larguraFoto + espacoFoto;
    contadorNaLinha++;
  });

  return yAtual + alturaFoto + 3;
}

/* Numera as páginas no rodapé ("Página X de N") — chamado só no final,
   depois que todas as páginas já existem. */
function adicionarRodape(doc, margemEsquerda, margemDireita) {
  const totalPaginas = doc.internal.getNumberOfPages();
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);
    doc.setDrawColor(...COR_BORDA);
    doc.setLineWidth(0.15);
    doc.line(margemEsquerda, alturaPagina - 12, larguraPagina - margemDireita, alturaPagina - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COR_SUAVE);
    doc.text('Mamma Mia · R&L Qualidade', margemEsquerda, alturaPagina - 7);
    doc.text(`Página ${pagina} de ${totalPaginas}`, larguraPagina - margemDireita, alturaPagina - 7, { align: 'right' });
  }
}

/* ---------- Relatório completo de UMA verificação ---------- */

/* Desenha o conteúdo completo de UMA verificação (relatório + plano de ação + assinaturas)
   dentro de um doc jsPDF já existente, a partir do topo da página atual.
   Usado tanto pelo PDF individual quanto pelo PDF consolidado (várias visitas num arquivo só). */
function renderizarVerificacao(doc, dados) {
  const { verificacao, itens, temperaturas } = dados;

  const margemEsquerda = 16;
  const margemDireita = 16;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda - margemDireita;

  /* Abre página nova se não couber. yAtual: o y de quem chamou (helpers têm o
     próprio y local). Devolve o y a usar dali em diante (18 se abriu página). */
  function novaPaginaSeNecessario(alturaNecessaria, yAtual = y) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    if (yAtual + alturaNecessaria > alturaPagina - 20) {
      doc.addPage();
      y = 18;
      return y;
    }
    return yAtual;
  }

  let y = desenharCabecalho(doc, {
    margemEsquerda,
    larguraUtil,
    titulo: `VERIFICAÇÃO TÉCNICA OPERACIONAL - ${verificacao.empresa}`
  });

  const larguraMeia = (larguraUtil - 12) / 2;
  const meioCabecalho = margemEsquerda + larguraMeia + 12;

  const yData = desenharCampo(doc, { x: margemEsquerda, y, largura: larguraMeia, rotulo: 'Data', valor: formatarDataBR(verificacao.data), tamanho: 10 });
  const yHorario = desenharCampo(doc, { x: meioCabecalho, y, largura: larguraMeia, rotulo: 'Horário de início', valor: verificacao.horario_inicio, tamanho: 10 });
  y = Math.max(yData, yHorario) + 3;

  const yResponsavel = desenharCampo(doc, { x: margemEsquerda, y, largura: larguraMeia, rotulo: 'Responsável pela verificação', valor: verificacao.responsavel_verificacao, tamanho: 10 });
  const yFolha = desenharCampo(doc, { x: meioCabecalho, y, largura: larguraMeia, rotulo: 'Folha', valor: String(verificacao.folha || ''), tamanho: 10 });
  y = Math.max(yResponsavel, yFolha) + 6;

  /* ---------- Itens ---------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COR_TEXTO);
  doc.text('Itens de Inspeção', margemEsquerda, y);
  y += 7;

  const itensOrdenados = [...itens].sort((a, b) => Number(a.numero_item) - Number(b.numero_item));

  itensOrdenados.forEach(item => {
    novaPaginaSeNecessario(18);

    const numero = String(item.numero_item).padStart(2, '0');
    const nomeItem = `${numero}. ${item.nome_item}`;
    const linhasNome = doc.splitTextToSize(nomeItem, larguraUtil - 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COR_TEXTO);
    doc.text(linhasNome, margemEsquerda, y);

    const statusTexto = item.status || '-';
    desenharSelo(doc, statusTexto, margemEsquerda + larguraUtil - 10, y, item.status === 'C' ? COR_CONFORME : item.status === 'NC' ? COR_NAO_CONFORME : COR_SUAVE, true);

    y += linhasNome.length * 5;

    if (item.status === 'NC' && item.descricao) {
      const textoDescricao = sanitizarTexto(item.descricao);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...COR_SUAVE);
      const linhasDescricao = doc.splitTextToSize(textoDescricao, larguraUtil - 8);
      novaPaginaSeNecessario(linhasDescricao.length * 4.5 + 4);
      doc.text(linhasDescricao, margemEsquerda + 4, y);
      y += linhasDescricao.length * 4.5 + 2;
    }

    y = desenharFotos(doc, { x: margemEsquerda + 4, y, largura: larguraUtil - 4, fotosBase64: item.fotosBase64, novaPaginaSeNecessario });

    y += 3;
  });

  /* ---------- Temperaturas ---------- */
  if (temperaturas && temperaturas.length > 0) {
    novaPaginaSeNecessario(14 + temperaturas.length * 6);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COR_TEXTO);
    doc.text('Temperatura das Câmaras', margemEsquerda, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    temperaturas.forEach(t => {
      novaPaginaSeNecessario(6);
      doc.setTextColor(...COR_TEXTO);
      doc.text(sanitizarTexto(t.identificacao) || '-', margemEsquerda, y);
      doc.text(`${t.temperatura}°C`, margemEsquerda + larguraUtil - 10, y, { align: 'right' });
      y += 6;
    });
  }

  /* ---------- Plano de Ação ---------- */
  const itensNC = itensOrdenados.filter(item => item.status === 'NC');
  if (itensNC.length > 0) {
    novaPaginaSeNecessario(16);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COR_TEXTO);
    doc.text('Plano de Ação', margemEsquerda, y);
    y += 7;

    itensNC.forEach(item => {
      y = desenharCartaoNaoConformidade(doc, {
        margemEsquerda,
        larguraUtil,
        novaPaginaSeNecessario,
        y,
        cabecalho: `Item ${String(item.numero_item).padStart(2, '0')} — ${item.nome_item}`,
        descricao: item.descricao,
        acaoCorretiva: item.acao_corretiva,
        responsavel: item.responsavel_acao,
        dataPrevista: item.data_prevista,
        dataRealizada: item.data_realizada,
        fotoResolucao: item.foto_resolucao
      });
    });

    novaPaginaSeNecessario(10);
    if (verificacao.assinatura_plano_acao_em) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COR_CONFORME);
      doc.text(
        `Plano de Ação assinado por: ${sanitizarTexto(verificacao.responsavel_plano_acao)} em ${formatarDataHoraBR(verificacao.assinatura_plano_acao_em)}`,
        margemEsquerda, y
      );
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COR_SUAVE);
      doc.text('Assinatura do responsável pelo Plano de Ação: ______________________________', margemEsquerda, y);
    }
    y += 8;
  }

  /* ---------- Observação ---------- */
  if (verificacao.observacao) {
    novaPaginaSeNecessario(16);
    y += 4;
    y = desenharCampo(doc, {
      x: margemEsquerda,
      y: y + 4,
      largura: larguraUtil,
      rotulo: 'Observação',
      valor: verificacao.observacao,
      tamanho: 9.5,
      novaPaginaSeNecessario
    });
  }

  /* ---------- Assinaturas ---------- */
  novaPaginaSeNecessario(30);
  y += 10;
  doc.setDrawColor(...COR_SUAVE);
  doc.setLineWidth(0.2);

  const meioPagina = margemEsquerda + larguraUtil / 2;

  doc.line(margemEsquerda, y, margemEsquerda + larguraUtil * 0.42, y);
  doc.line(meioPagina + larguraUtil * 0.08, y, margemEsquerda + larguraUtil, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COR_SUAVE);
  doc.text('Responsável pela auditoria', margemEsquerda, y);
  doc.text('Responsável pela empresa', meioPagina + larguraUtil * 0.08, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COR_TEXTO);
  doc.text(sanitizarTexto(verificacao.responsavel_auditoria) || '-', margemEsquerda, y);
  doc.text(sanitizarTexto(verificacao.responsavel_empresa) || '-', meioPagina + larguraUtil * 0.08, y);

  if (verificacao.confirmado_em) {
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COR_SUAVE);
    doc.text(`Confirmado em ${formatarDataHoraBR(verificacao.confirmado_em)}`, margemEsquerda, y);
  }
}

export function gerarPdfVerificacao(dados) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  renderizarVerificacao(doc, dados);
  adicionarRodape(doc, 16, 16);

  const { verificacao } = dados;
  const nomeArquivo = `Verificacao_${verificacao.empresa}_${verificacao.data}_Folha${verificacao.folha}.pdf`;
  doc.save(nomeArquivo);
}

/* Gera UM único PDF juntando várias verificações (ex: todas as folhas de uma empresa numa data),
   cada uma com relatório + plano de ação + assinaturas, cada visita começando numa página nova. */
export function gerarPdfConsolidado(listaDeDados, nomeArquivo) {
  if (!listaDeDados || listaDeDados.length === 0) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  listaDeDados.forEach((dados, indice) => {
    if (indice > 0) doc.addPage();
    renderizarVerificacao(doc, dados);
  });

  adicionarRodape(doc, 16, 16);

  const primeira = listaDeDados[0].verificacao;
  const arquivoFinal = nomeArquivo || `Verificacao_${primeira.empresa}_${primeira.data}.pdf`;
  doc.save(arquivoFinal);
}

/* ---------- Cartão de não conformidade (usado no Plano de Ação e dentro do relatório) ---------- */

/* Desenha o cartão de uma não conformidade: cabeçalho com selo de prioridade
   e status, descrição, ação corretiva, responsável/datas (cada um como campo
   próprio, não mais tudo numa linha só) e a foto de resolução, se houver.
   Termina com uma barra colorida à esquerda (prioridade, ou verde se já
   concluída) e uma borda fina ao redor do cartão inteiro. Devolve o y seguinte. */
/* "Doc" de medição: calcula quebras de linha e alturas como o doc real, mas
   não desenha nada (text/rect/line/addImage viram no-op). */
function criarMedidor(doc) {
  const ignorar = new Set(['text', 'rect', 'roundedRect', 'line', 'addImage']);
  const medidor = new Proxy(doc, {
    get(alvo, prop) {
      if (prop === '__medindo') return true;
      if (ignorar.has(prop)) return () => medidor;
      const valor = alvo[prop];
      return typeof valor === 'function' ? valor.bind(alvo) : valor;
    }
  });
  return medidor;
}

/* Cartão de NC sem quebra no meio: mede a altura inteira antes de desenhar e,
   se não couber no resto da página, começa na página seguinte. Só um cartão
   maior que uma página inteira é dividido (com moldura fechada em cada parte). */
function desenharCartaoNaoConformidade(doc, opcoes) {
  const alturaCartao = desenharConteudoCartaoNC(criarMedidor(doc), {
    ...opcoes, y: 0, novaPaginaSeNecessario: (altura, yAtual) => yAtual
  }) - 5; // o retorno inclui 6 mm de espaço depois do cartão
  const alturaUtilPagina = doc.internal.pageSize.getHeight() - 18 - 20;
  // Cabe numa página: começa onde houver espaço pro cartão inteiro. Não cabe: começa já (com ~40 mm livres) e continua na seguinte.
  const y = opcoes.novaPaginaSeNecessario(alturaCartao <= alturaUtilPagina ? alturaCartao : 40, opcoes.y);
  return desenharConteudoCartaoNC(doc, { ...opcoes, y });
}

function desenharConteudoCartaoNC(doc, opcoes) {
  const {
    margemEsquerda, larguraUtil, novaPaginaSeNecessario, y: yInicial,
    cabecalho, prioridadeSelo, descricao, acaoCorretiva, responsavel,
    dataPrevista, dataRealizada, fotoResolucao
  } = opcoes;

  let y = yInicial;
  let boxY = y;
  const xConteudo = margemEsquerda + 5;
  const larguraConteudo = larguraUtil - 9;

  const prioridade = prioridadeSelo !== undefined ? prioridadeSelo : extrairPrioridade(acaoCorretiva);
  const textoAcaoCorretiva = prioridadeSelo !== undefined ? acaoCorretiva : removerPrefixoPrioridade(acaoCorretiva);
  const concluida = !!dataRealizada;
  const medindo = doc.__medindo === true;

  /* Fundo vermelho claro das NCs pendentes. A altura do cartão só é conhecida
     no fim, então o retângulo é desenhado depois e as operações dele são movidas
     pro ponto do conteúdo da página onde o cartão começou (fica ATRÁS do texto
     e da foto). q/Q isola a cor de preenchimento do resto da página. */
  const marcarInicioFundo = () => {
    if (medindo) return null;
    const pagina = doc.getCurrentPageInfo().pageNumber;
    return { pagina, indice: doc.internal.pages[pagina].length };
  };
  let inicioFundo = marcarInicioFundo();
  const pintarFundo = (topo, fim) => {
    if (concluida || medindo || !inicioFundo) return;
    const operacoes = doc.internal.pages[inicioFundo.pagina];
    const antes = operacoes.length;
    doc.saveGraphicsState();
    doc.setFillColor(...COR_PENDENTE_FUNDO);
    doc.rect(margemEsquerda, topo - 3, larguraUtil, fim - topo + 2, 'F');
    doc.restoreGraphicsState();
    operacoes.splice(inicioFundo.indice, 0, ...operacoes.splice(antes));
  };

  const desenharMoldura = (topo, fim) => {
    pintarFundo(topo, fim);
    doc.setDrawColor(...(concluida ? COR_BORDA : COR_PENDENTE));
    doc.setLineWidth(concluida ? 0.2 : 0.35);
    doc.rect(margemEsquerda, topo - 3, larguraUtil, fim - topo + 2);
    doc.setDrawColor(...(concluida ? COR_RESOLVIDA : COR_PENDENTE));
    doc.setLineWidth(concluida ? 1.1 : 1.6);
    doc.line(margemEsquerda + 0.6, topo - 3, margemEsquerda + 0.6, fim - 1);
  };

  /* Quebra dentro do cartão (só acontece se ele for maior que uma página):
     fecha a moldura da parte anterior na página de trás e continua na nova. */
  const quebra = (alturaNecessaria, yAtual) => {
    const paginasAntes = doc.getNumberOfPages();
    const novoY = novaPaginaSeNecessario(alturaNecessaria, yAtual);
    if (doc.getNumberOfPages() !== paginasAntes) {
      const paginaAtual = doc.getCurrentPageInfo().pageNumber;
      doc.setPage(paginaAtual - 1);
      desenharMoldura(boxY, yAtual);
      doc.setPage(paginaAtual);
      boxY = novoY + 3;
      inicioFundo = marcarInicioFundo();
    }
    return novoY;
  };

  y += 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COR_TEXTO);
  const linhasCabecalho = doc.splitTextToSize(cabecalho, larguraConteudo - 26);
  doc.text(linhasCabecalho, xConteudo, y + 3);

  if (concluida) {
    desenharSelo(doc, 'RESOLVIDA', margemEsquerda + larguraUtil - 5, y + 3, COR_RESOLVIDA, true);
  } else {
    // Selo cheio vermelho com texto branco: "PENDENTE" tem que saltar aos olhos
    const xDireita = margemEsquerda + larguraUtil - 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const larguraSelo = doc.getTextWidth('PENDENTE') + 4;
    if (!medindo) {
      doc.saveGraphicsState();
      doc.setFillColor(...COR_PENDENTE);
      doc.roundedRect(xDireita - larguraSelo, y - 0.2, larguraSelo, 4.6, 1, 1, 'F');
      doc.restoreGraphicsState();
    }
    doc.setTextColor(255, 255, 255);
    doc.text('PENDENTE', xDireita - 2, y + 3, { align: 'right' });
  }
  if (prioridade) {
    desenharSelo(doc, prioridade, margemEsquerda + larguraUtil - 5, y + 8, COR_PRIORIDADE[prioridade] || COR_SUAVE, true);
  }
  y += Math.max(linhasCabecalho.length * 4.2, prioridade ? 11 : 6) + 2;

  y = desenharCampo(doc, {
    x: xConteudo, y, largura: larguraConteudo,
    rotulo: 'Descrição da não conformidade', valor: descricao, vazio: '(sem descrição)',
    novaPaginaSeNecessario: quebra
  }) + 2.5;

  y = desenharCampo(doc, {
    x: xConteudo, y, largura: larguraConteudo,
    rotulo: 'Ação corretiva', valor: textoAcaoCorretiva, vazio: '(ação corretiva ainda não definida)',
    novaPaginaSeNecessario: quebra
  }) + 2.5;

  y = quebra(9, y);
  y = desenharCampo(doc, {
    x: xConteudo, y, largura: larguraConteudo,
    rotulo: 'Responsável', valor: responsavel, tamanho: 9,
    novaPaginaSeNecessario: quebra
  }) + 2.5;

  y = quebra(9, y);
  const largMetade = (larguraConteudo - 8) / 2;
  const yPrevista = desenharCampo(doc, { x: xConteudo, y, largura: largMetade, rotulo: 'Data prevista', valor: dataPrevista ? formatarDataBR(dataPrevista) : '', vazio: 'Não definida', tamanho: 9 });
  const yRealizada = desenharCampo(doc, { x: xConteudo + largMetade + 8, y, largura: largMetade, rotulo: 'Data realizada', valor: dataRealizada ? formatarDataBR(dataRealizada) : 'NÃO RESOLVIDA', cor: concluida ? COR_RESOLVIDA : COR_PENDENTE, negrito: !concluida, tamanho: 9 });
  y = Math.max(yPrevista, yRealizada) + 2.5;

  if (fotoResolucao) {
    y = desenharFotos(doc, { x: xConteudo, y, largura: larguraConteudo, fotosBase64: [fotoResolucao], rotulo: 'Foto da resolução', novaPaginaSeNecessario: quebra }) + 1;
  }

  desenharMoldura(boxY, y);

  return y + 6;
}

/* Só embutimos a foto quando temos o base64 em mãos — a versão vinda do
   backend costuma ser um link do Drive, que o jsPDF não consegue buscar
   sozinho pra desenhar. */
function resolverFotoBase64(nc) {
  if (nc._fotoResolucaoPreview) return nc._fotoResolucaoPreview;
  if (nc.foto_resolucao_base64) return nc.foto_resolucao_base64;
  if (String(nc.foto_resolucao || '').startsWith('data:')) return nc.foto_resolucao;
  return '';
}

function quebrarPorPartes(doc, partes, largura) {
  const linhas = [];
  let atual = '';
  partes.forEach((parte, i) => {
    const sep = i < partes.length - 1 ? ' ·' : '';
    const tentativa = atual ? `${atual} ${parte}${sep}` : `${parte}${sep}`;
    if (atual && doc.getTextWidth(tentativa) > largura) {
      linhas.push(atual);
      atual = `${parte}${sep}`;
    } else {
      atual = tentativa;
    }
  });
  if (atual) linhas.push(atual);
  return linhas.flatMap(l => doc.splitTextToSize(l, largura));
}

/* "dd/mm/aaaa hh:mm" no horário de Brasília (padrão do sistema) */
function agoraBrasilia() {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

/* filtros.partes (opcional): textos dos filtros ativos, ex. ['08/10/2026 · YUKA · Folha 1', 'NCs resolvidas'].
   Com filtros, o título vira "PLANO DE AÇÃO · <filtros> · N não conformidade(s)". */
export function gerarPdfPlanoAcao(lista, nomeArquivo, filtros = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margemEsquerda = 16;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda * 2;
  const partesFiltro = (filtros.partes || []).filter(Boolean);
  let y = desenharCabecalho(doc, {
    margemEsquerda,
    larguraUtil,
    titulo: partesFiltro.length
      ? ['PLANO DE AÇÃO', ...partesFiltro, `${lista.length} não conformidade(s)`]
      : 'PLANO DE AÇÃO',
    subtitulo: partesFiltro.length
      ? `Gerado em ${agoraBrasilia()}`
      : `${lista.length} não conformidade(s) · Gerado em ${agoraBrasilia()}`
  });

  /* Mesma regra de renderizarVerificacao: recebe o y de quem chamou e devolve o y a usar. */
  function novaPaginaSeNecessario(alturaNecessaria, yAtual = y) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    if (yAtual + alturaNecessaria > alturaPagina - 16) {
      doc.addPage();
      y = 18;
      return y;
    }
    return yAtual;
  }

  lista.forEach(nc => {
    y = desenharCartaoNaoConformidade(doc, {
      margemEsquerda,
      larguraUtil,
      novaPaginaSeNecessario,
      y,
      cabecalho: `${nc.empresa} · ${formatarDataBR(nc.data)} · Folha ${nc.folha} · Item ${String(nc.numero_item).padStart(2, '0')} — ${nc.nome_item}`,
      descricao: nc.descricao,
      acaoCorretiva: nc.acao_corretiva,
      responsavel: nc.responsavel,
      dataPrevista: nc.data_prevista,
      dataRealizada: nc.data_realizada,
      fotoResolucao: resolverFotoBase64(nc)
    });
  });

  adicionarRodape(doc, margemEsquerda, margemEsquerda);
  doc.save(nomeArquivo || `Plano_de_Acao_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfNaoConformidade(nc) {
  const nomeArquivo = `NC_${nc.empresa}_${nc.data}_Item${String(nc.numero_item).padStart(2, '0')}.pdf`;
  gerarPdfPlanoAcao([nc], nomeArquivo);
}
