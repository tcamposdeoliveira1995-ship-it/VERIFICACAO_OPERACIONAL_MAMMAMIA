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

    const fotos = item.fotos ? String(item.fotos).split(',').filter(Boolean) : [];
    if (fotos.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...COR_DOURADO);
      fotos.forEach((url, idx) => {
        novaPaginaSeNecessario(5);
        doc.textWithLink(`Foto ${idx + 1} anexada (abrir link)`, margemEsquerda + 4, y, { url });
        y += 4.5;
      });
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
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHoraBR(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('pt-BR');
}
