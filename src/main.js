import { criarEstadoInicial, montarTelaNovaVerificacao } from './telaNovaVerificacao.js';
import { criarEstadoHistorico, montarTelaHistorico } from './telaHistorico.js';
import { criarEstadoPlanoAcao, montarTelaPlanoAcao } from './telaPlanoAcao.js';
import { gerarPdfVerificacao } from './gerarPdf.js';

const appEl = document.getElementById('app');

let telaAtual = 'historico'; // historico | nova | plano
let estadoNovaVerificacao = criarEstadoInicial();
let estadoHistorico = criarEstadoHistorico();
let estadoPlanoAcao = criarEstadoPlanoAcao();

function render() {
  appEl.innerHTML = '';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'cabecalho-app';
  cabecalho.innerHTML = `
    <div class="cabecalho-app__marca">Mamma Mia · R&L Qualidade</div>
    <div class="cabecalho-app__titulo">Verificação Técnica Operacional</div>
  `;
  appEl.appendChild(cabecalho);

  const nav = document.createElement('div');
  nav.style.display = 'flex';
  nav.style.gap = '8px';
  nav.style.padding = '12px 20px';
  nav.style.background = 'var(--cor-superficie)';
  nav.style.borderBottom = '1px solid var(--cor-borda)';
  nav.innerHTML = `
    <button class="botao ${telaAtual === 'historico' ? 'botao--primario' : 'botao--secundario'}" data-tela="historico" style="flex:1;">Histórico</button>
    <button class="botao ${telaAtual === 'nova' ? 'botao--primario' : 'botao--secundario'}" data-tela="nova" style="flex:1;">Nova</button>
    <button class="botao ${telaAtual === 'plano' ? 'botao--primario' : 'botao--secundario'}" data-tela="plano" style="flex:1;">Plano de Ação</button>
  `;
  nav.querySelectorAll('[data-tela]').forEach(botao => {
    botao.addEventListener('click', () => {
      if (botao.dataset.tela === 'nova') {
        estadoNovaVerificacao = criarEstadoInicial();
      }
      if (botao.dataset.tela === 'historico') {
        estadoHistorico = criarEstadoHistorico();
      }
      if (botao.dataset.tela === 'plano') {
        estadoPlanoAcao = criarEstadoPlanoAcao();
      }
      telaAtual = botao.dataset.tela;
      render();
    });
  });
  appEl.appendChild(nav);

  const containerTela = document.createElement('div');
  appEl.appendChild(containerTela);

  if (telaAtual === 'nova') {
    montarTelaNovaVerificacao(containerTela, estadoNovaVerificacao, salvarEstadoNovaVerificacao, irParaHistorico);
  } else if (telaAtual === 'plano') {
    montarTelaPlanoAcao(containerTela, estadoPlanoAcao, salvarEstadoPlanoAcao);
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

function salvarEstadoPlanoAcao(novoEstado) {
  estadoPlanoAcao = novoEstado;
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
