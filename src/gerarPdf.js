import { jsPDF } from 'jspdf';

const COR_DOURADO = [201, 162, 39];
const COR_TEXTO = [30, 28, 24];
const COR_SUAVE = [110, 105, 96];
const COR_CONFORME = [60, 120, 85];
const COR_NAO_CONFORME = [180, 55, 45];
const COR_ALERTA = [201, 140, 39];
const COR_BORDA = [225, 219, 205];

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
  doc.text(titulo, margemEsquerda, y);
  y += 6;

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
function desenharCampo(doc, { x, y, largura, rotulo, valor, vazio = 'Não definido', cor = COR_TEXTO, tamanho = 9.5, novaPaginaSeNecessario }) {
  const texto = sanitizarTexto(valor);
  const linhas = doc.splitTextToSize(texto || vazio, largura);
  const alturaLinha = tamanho * 0.46;
  const alturaTotal = 3.8 + linhas.length * alturaLinha;

  if (novaPaginaSeNecessario) novaPaginaSeNecessario(alturaTotal);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...COR_SUAVE);
  doc.text(rotulo.toUpperCase(), x, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tamanho);
  doc.setTextColor(...(texto ? cor : COR_SUAVE));
  doc.text(linhas, x, y + 4);

  return y + 4 + linhas.length * alturaLinha;
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

  if (novaPaginaSeNecessario) novaPaginaSeNecessario(alturaFoto + 8);

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
      if (novaPaginaSeNecessario) novaPaginaSeNecessario(alturaFoto + 4);
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

  function novaPaginaSeNecessario(alturaNecessaria) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    if (y + alturaNecessaria > alturaPagina - 20) {
      doc.addPage();
      y = 18;
    }
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
function desenharCartaoNaoConformidade(doc, opcoes) {
  const {
    margemEsquerda, larguraUtil, novaPaginaSeNecessario, y: yInicial,
    cabecalho, prioridadeSelo, descricao, acaoCorretiva, responsavel,
    dataPrevista, dataRealizada, fotoResolucao
  } = opcoes;

  novaPaginaSeNecessario(30);
  let y = yInicial;
  const boxY = y;
  const xConteudo = margemEsquerda + 5;
  const larguraConteudo = larguraUtil - 9;

  const prioridade = prioridadeSelo !== undefined ? prioridadeSelo : extrairPrioridade(acaoCorretiva);
  const textoAcaoCorretiva = prioridadeSelo !== undefined ? acaoCorretiva : removerPrefixoPrioridade(acaoCorretiva);
  const concluida = !!dataRealizada;

  y += 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COR_TEXTO);
  const linhasCabecalho = doc.splitTextToSize(cabecalho, larguraConteudo - 26);
  doc.text(linhasCabecalho, xConteudo, y + 3);

  desenharSelo(doc, concluida ? 'CONCLUÍDO' : 'PENDENTE', margemEsquerda + larguraUtil - 5, y + 3, concluida ? COR_CONFORME : COR_NAO_CONFORME, true);
  if (prioridade) {
    desenharSelo(doc, prioridade, margemEsquerda + larguraUtil - 5, y + 8, COR_PRIORIDADE[prioridade] || COR_SUAVE, true);
  }
  y += Math.max(linhasCabecalho.length * 4.2, prioridade ? 11 : 6) + 2;

  y = desenharCampo(doc, {
    x: xConteudo, y, largura: larguraConteudo,
    rotulo: 'Descrição da não conformidade', valor: descricao, vazio: '(sem descrição)',
    novaPaginaSeNecessario
  }) + 2.5;

  y = desenharCampo(doc, {
    x: xConteudo, y, largura: larguraConteudo,
    rotulo: 'Ação corretiva', valor: textoAcaoCorretiva, vazio: '(ação corretiva ainda não definida)',
    novaPaginaSeNecessario
  }) + 2.5;

  novaPaginaSeNecessario(9);
  y = desenharCampo(doc, {
    x: xConteudo, y, largura: larguraConteudo,
    rotulo: 'Responsável', valor: responsavel, tamanho: 9,
    novaPaginaSeNecessario
  }) + 2.5;

  novaPaginaSeNecessario(9);
  const largMetade = (larguraConteudo - 8) / 2;
  const yPrevista = desenharCampo(doc, { x: xConteudo, y, largura: largMetade, rotulo: 'Prevista', valor: dataPrevista ? formatarDataBR(dataPrevista) : '', vazio: 'Não definida', tamanho: 9 });
  const yRealizada = desenharCampo(doc, { x: xConteudo + largMetade + 8, y, largura: largMetade, rotulo: 'Realizada', valor: dataRealizada ? formatarDataBR(dataRealizada) : '', vazio: 'Pendente', cor: concluida ? COR_CONFORME : COR_NAO_CONFORME, tamanho: 9 });
  y = Math.max(yPrevista, yRealizada) + 2.5;

  if (fotoResolucao) {
    y = desenharFotos(doc, { x: xConteudo, y, largura: larguraConteudo, fotosBase64: [fotoResolucao], rotulo: 'Foto da resolução', novaPaginaSeNecessario }) + 1;
  }

  doc.setDrawColor(...COR_BORDA);
  doc.setLineWidth(0.2);
  doc.rect(margemEsquerda, boxY - 3, larguraUtil, y - boxY + 2);

  doc.setDrawColor(...(concluida ? COR_CONFORME : (COR_PRIORIDADE[prioridade] || COR_SUAVE)));
  doc.setLineWidth(1.1);
  doc.line(margemEsquerda + 0.6, boxY - 3, margemEsquerda + 0.6, y - 1);

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

export function gerarPdfPlanoAcao(lista, nomeArquivo) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margemEsquerda = 16;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda * 2;
  let y = desenharCabecalho(doc, {
    margemEsquerda,
    larguraUtil,
    titulo: 'PLANO DE AÇÃO',
    subtitulo: `${lista.length} não conformidade(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`
  });

  function novaPaginaSeNecessario(alturaNecessaria) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    if (y + alturaNecessaria > alturaPagina - 16) {
      doc.addPage();
      y = 18;
    }
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
