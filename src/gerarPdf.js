import { jsPDF } from 'jspdf';

const COR_DOURADO = [201, 162, 39];
const COR_TEXTO = [30, 28, 24];
const COR_SUAVE = [110, 105, 96];
const COR_CONFORME = [60, 120, 85];
const COR_NAO_CONFORME = [180, 55, 45];

export function gerarPdfVerificacao(dados) {
  const { verificacao, itens, temperaturas } = dados;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const margemEsquerda = 16;
  const margemDireita = 16;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda - margemDireita;
  let y = 18;

  function novaPaginaSeNecessario(alturaNecessaria) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    if (y + alturaNecessaria > alturaPagina - 20) {
      doc.addPage();
      y = 18;
    }
  }

  /* ---------- Cabeçalho ---------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COR_DOURADO);
  doc.text('MAMMA MIA · R&L QUALIDADE', margemEsquerda, y);
  y += 7;

  doc.setFontSize(15);
  doc.setTextColor(...COR_TEXTO);
  doc.text(`VERIFICAÇÃO TÉCNICA OPERACIONAL - ${verificacao.empresa}`, margemEsquerda, y);
  y += 8;

  doc.setDrawColor(...COR_DOURADO);
  doc.setLineWidth(0.5);
  doc.line(margemEsquerda, y, margemEsquerda + larguraUtil, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COR_SUAVE);
  const infoLinha = `Data: ${formatarDataBR(verificacao.data)}     Horário de início: ${verificacao.horario_inicio}     Responsável: ${verificacao.responsavel_verificacao}     Folha: ${verificacao.folha}`;
  doc.text(infoLinha, margemEsquerda, y);
  y += 10;

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
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(item.status === 'C' ? COR_CONFORME : item.status === 'NC' ? COR_NAO_CONFORME : COR_SUAVE));
    doc.text(statusTexto, margemEsquerda + larguraUtil - 10, y, { align: 'right' });

    y += linhasNome.length * 5;

    if (item.status === 'NC' && item.descricao) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...COR_SUAVE);
      const linhasDescricao = doc.splitTextToSize(item.descricao, larguraUtil - 8);
      novaPaginaSeNecessario(linhasDescricao.length * 4.5 + 4);
      doc.text(linhasDescricao, margemEsquerda + 4, y);
      y += linhasDescricao.length * 4.5 + 2;
    }

    const fotosBase64 = item.fotosBase64 || [];
    if (fotosBase64.length > 0) {
      const larguraFoto = 32;
      const alturaFoto = 32;
      const espacoFoto = 4;
      const fotosPorLinha = Math.floor(larguraUtil / (larguraFoto + espacoFoto));

      novaPaginaSeNecessario(alturaFoto + 4);
      let xFoto = margemEsquerda + 4;
      let contadorNaLinha = 0;

      fotosBase64.forEach(base64 => {
        if (contadorNaLinha >= fotosPorLinha) {
          xFoto = margemEsquerda + 4;
          contadorNaLinha = 0;
          y += alturaFoto + espacoFoto;
          novaPaginaSeNecessario(alturaFoto + 4);
        }
        try {
          const formato = base64.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(base64, formato, xFoto, y, larguraFoto, alturaFoto);
        } catch (err) {
          // se uma imagem específica falhar, segue sem travar o PDF inteiro
        }
        xFoto += larguraFoto + espacoFoto;
        contadorNaLinha++;
      });
      y += alturaFoto + 4;
    }

    if (item.status === 'NC' && (item.acao_corretiva || item.responsavel_acao || item.data_prevista || item.data_realizada)) {
      novaPaginaSeNecessario(20);
      const boxY = y;
      doc.setDrawColor(...COR_DOURADO);
      doc.setLineWidth(0.2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...COR_DOURADO);
      doc.text('PLANO DE AÇÃO', margemEsquerda + 4, y);
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COR_TEXTO);
      if (item.acao_corretiva) {
        const linhas = doc.splitTextToSize(`Ação corretiva: ${item.acao_corretiva}`, larguraUtil - 10);
        doc.text(linhas, margemEsquerda + 4, y);
        y += linhas.length * 4.5;
      }
      const linhaMeta = [
        item.responsavel_acao ? `Responsável: ${item.responsavel_acao}` : null,
        item.data_prevista ? `Prevista: ${formatarDataBR(item.data_prevista)}` : null,
        item.data_realizada ? `Realizada: ${formatarDataBR(item.data_realizada)}` : null
      ].filter(Boolean).join('     ');
      if (linhaMeta) {
        doc.setTextColor(...COR_SUAVE);
        doc.text(linhaMeta, margemEsquerda + 4, y);
        y += 4.5;
      }
      doc.rect(margemEsquerda, boxY - 4, larguraUtil, y - boxY + 2);
      y += 3;
    }

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
      doc.text(t.identificacao || '-', margemEsquerda, y);
      doc.text(`${t.temperatura}°C`, margemEsquerda + larguraUtil - 10, y, { align: 'right' });
      y += 6;
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

  doc.setFontSize(9);
  doc.setTextColor(...COR_SUAVE);
  doc.text('Responsável pela auditoria', margemEsquerda, y);
  doc.text('Responsável pela empresa', meioPagina + larguraUtil * 0.08, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COR_TEXTO);
  doc.text(verificacao.responsavel_auditoria || '-', margemEsquerda, y);
  doc.text(verificacao.responsavel_empresa || '-', meioPagina + larguraUtil * 0.08, y);

  if (verificacao.confirmado_em) {
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COR_SUAVE);
    doc.text(`Confirmado em ${formatarDataHoraBR(verificacao.confirmado_em)}`, margemEsquerda, y);
  }

  const nomeArquivo = `Verificacao_${verificacao.empresa}_${verificacao.data}_Folha${verificacao.folha}.pdf`;
  doc.save(nomeArquivo);
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHoraBR(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('pt-BR');
}

function desenharCabecalhoPlano(doc, margemEsquerda, larguraUtil, subtitulo) {
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COR_DOURADO);
  doc.text('MAMMA MIA · R&L QUALIDADE', margemEsquerda, y);
  y += 7;

  doc.setFontSize(15);
  doc.setTextColor(...COR_TEXTO);
  doc.text('PLANO DE AÇÃO', margemEsquerda, y);
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

export function gerarPdfPlanoAcao(lista, nomeArquivo) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margemEsquerda = 16;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda * 2;
  let y = desenharCabecalhoPlano(doc, margemEsquerda, larguraUtil, `${lista.length} não conformidade(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`);

  function novaPaginaSeNecessario(alturaNecessaria) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    if (y + alturaNecessaria > alturaPagina - 16) {
      doc.addPage();
      y = 18;
    }
  }

  lista.forEach(nc => {
    novaPaginaSeNecessario(28);
    const boxY = y;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COR_TEXTO);
    doc.text(`${nc.empresa} · ${formatarDataBR(nc.data)} · Folha ${nc.folha} · Item ${String(nc.numero_item).padStart(2, '0')}`, margemEsquerda + 4, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const linhasNome = doc.splitTextToSize(nc.nome_item, larguraUtil - 8);
    doc.text(linhasNome, margemEsquerda + 4, y);
    y += linhasNome.length * 4.3;

    if (nc.descricao) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...COR_SUAVE);
      const linhasDescricao = doc.splitTextToSize(nc.descricao, larguraUtil - 8);
      novaPaginaSeNecessario(linhasDescricao.length * 4.3 + 4);
      doc.text(linhasDescricao, margemEsquerda + 4, y);
      y += linhasDescricao.length * 4.3 + 2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COR_TEXTO);
    if (nc.acao_corretiva) {
      const linhas = doc.splitTextToSize(`Ação corretiva: ${nc.acao_corretiva}`, larguraUtil - 8);
      novaPaginaSeNecessario(linhas.length * 4.3);
      doc.text(linhas, margemEsquerda + 4, y);
      y += linhas.length * 4.3;
    } else {
      doc.setTextColor(...COR_SUAVE);
      doc.text('Ação corretiva: (não definida)', margemEsquerda + 4, y);
      y += 4.3;
    }

    const meta = [
      nc.responsavel ? `Responsável: ${nc.responsavel}` : null,
      nc.data_prevista ? `Prevista: ${formatarDataBR(nc.data_prevista)}` : null,
      nc.data_realizada ? `Realizada: ${formatarDataBR(nc.data_realizada)}` : 'Realizada: pendente'
    ].filter(Boolean).join('     ');
    doc.setTextColor(...(nc.data_realizada ? COR_CONFORME : COR_NAO_CONFORME));
    doc.text(meta, margemEsquerda + 4, y);
    y += 5;

    doc.setDrawColor(...COR_SUAVE);
    doc.setLineWidth(0.15);
    doc.rect(margemEsquerda, boxY - 4, larguraUtil, y - boxY + 1);
    y += 6;
  });

  doc.save(nomeArquivo || `Plano_de_Acao_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfNaoConformidade(nc) {
  const nomeArquivo = `NC_${nc.empresa}_${nc.data}_Item${String(nc.numero_item).padStart(2, '0')}.pdf`;
  gerarPdfPlanoAcao([nc], nomeArquivo);
}
