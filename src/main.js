import { criarEstadoInicial, montarTelaNovaVerificacao } from './telaNovaVerificacao.js';
import { criarEstadoHistorico, montarTelaHistorico } from './telaHistorico.js';
import { gerarPdfVerificacao } from './gerarPdf.js';

const appEl = document.getElementById('app');

let telaAtual = 'historico'; // abre no histórico por padrão
let estadoNovaVerificacao = criarEstadoInicial();
let estadoHistorico = criarEstadoHistorico();

function render() {
  appEl.innerHTML = '';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'cabecalho-app';
  cabecalho.innerHTML = `
    <div class="cabecalho-app__marca">Mamma Mia · R&L Qualidade</div>
    <div class="cabecalho-app__titulo">Verificação Técnica Operacional</div>
  `;
  appEl.appendChild(cabecalho);

  const containerTela = document.createElement('div');
  appEl.appendChild(containerTela);

  if (telaAtual === 'nova') {
    montarTelaNovaVerificacao(containerTela, estadoNovaVerificacao, salvarEstadoNovaVerificacao, irParaHistorico);
  } else {
    montarTelaHistorico(containerTela, estadoHistorico, salvarEstadoHistorico, irParaNovaVerificacao, abrirPdf);
  }
}

function salvarEstadoNovaVerificacao(novoEstado) {
  estadoNovaVerificacao = novoEstado;
  render();
}

function salvarEstadoHistorico(novoEstado) {
  estadoHistorico = novoEstado;
  render();
}

function irParaHistorico() {
  estadoNovaVerificacao = criarEstadoInicial();
  estadoHistorico = criarEstadoHistorico();
  telaAtual = 'historico';
  render();
}

function irParaNovaVerificacao() {
  estadoNovaVerificacao = criarEstadoInicial();
  telaAtual = 'nova';
  render();
}

function abrirPdf(dadosVerificacao) {
  gerarPdfVerificacao(dadosVerificacao);
}

render();
