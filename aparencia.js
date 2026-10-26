/* Aparência: visual (Clássico ou Minimal Premium), modo claro/escuro, cor de destaque e plano de fundo animado.
   A escolha fica guardada neste navegador e vale só para quem a fez. */
(function () {
  'use strict';
  // Chave nova (v2): escolhas antigas são descartadas uma vez, para todos começarem no padrão abaixo
  const CHAVE = 'radar-aparencia-v2';
  try { localStorage.removeItem('radar-aparencia'); } catch (e) { /* sem armazenamento */ }
  // Padrão do site: Clássico escuro, destaque roxo e fundo de ondas na mesma cor, com movimento suave
  const PADRAO = { visual: 'classico', modo: 'escuro', destaque: '#7C3AED', fundo: 'ondas', fundoCor: null, movimento: 'suave' };
  const CORES = [['Original do tema', null], ['Azul', '#4277F4'], ['Verde', '#16A34A'], ['Roxo', '#7C3AED'], ['Ciano', '#0891B2'], ['Laranja', '#EA580C'], ['Vermelho', '#DC2626']];
  const FUNDOS = [['nenhum', 'Nenhum'], ['aurora', 'Aurora'], ['ondas', 'Ondas'], ['grade', 'Grade']];
  const CORES_FUNDO = [['Igual à cor de destaque', null], ['Azul', '#3B82F6'], ['Ciano', '#06B6D4'], ['Roxo', '#8B5CF6'], ['Verde', '#10B981'], ['Rosa', '#EC4899'], ['Dourado', '#F59E0B']];
  let pref = { ...PADRAO };
  try { pref = { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch (e) { /* sem armazenamento: usa o padrão */ }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(pref)); } catch (e) { /* navegador sem armazenamento */ } };
  const premium = () => pref.visual === 'premium';
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const clarear = (h, t) => '#' + rgb(h).map(x => Math.round(x + (255 - x) * t).toString(16).padStart(2, '0')).join('');
  const claro = h => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6; };
  // gira o matiz da cor (em graus) mantendo saturação e luminosidade: dá o segundo tom da aurora
  function girar(h, graus) {
    const [r, g, b] = rgb(h).map(x => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    let m = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    m = (m * 60 + graus + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((m / 60) % 2 - 1)), k = l - c / 2;
    const t = m < 60 ? [c, x, 0] : m < 120 ? [x, c, 0] : m < 180 ? [0, c, x] : m < 240 ? [0, x, c] : m < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + t.map(v => Math.round((v + k) * 255).toString(16).padStart(2, '0')).join('');
  }

  // Plano de fundo: camada fixa atrás do sistema (o desenho e a animação estão no servidor.css)
  function aplicarFundo() {
    let el = document.getElementById('fundo');
    if (!FUNDOS.some(f => f[0] === pref.fundo && f[0] !== 'nenhum')) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'fundo';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<b></b><i></i><i></i><i></i>';
      document.body.prepend(el);
    }
    el.className = `fundo fundo-${pref.fundo}${pref.movimento === 'parado' ? ' parado' : ''}`;
    const base = pref.fundoCor || pref.destaque || (premium() ? '#4277F4' : '#5B5FE0');
    el.style.setProperty('--fundo-a', rgb(base).join(', '));
    el.style.setProperty('--fundo-b', rgb(girar(base, 45)).join(', '));
  }

  function aplicar() {
    const html = document.documentElement, link = document.getElementById('tema-premium');
    if (link) link.disabled = !premium();
    html.dataset.visual = pref.visual;
    if (!premium() && pref.modo !== 'auto') html.dataset.theme = pref.modo === 'escuro' ? 'dark' : 'light';
    else delete html.dataset.theme;
    const vars = { '--primary': null, '--primary-2': null, '--primary-soft': null, '--primary-line': null, '--on-primary': null };
    if (pref.destaque) {
      const [r, g, b] = rgb(pref.destaque);
      Object.assign(vars, { '--primary': pref.destaque, '--primary-2': clarear(pref.destaque, 0.3), '--primary-soft': `rgba(${r}, ${g}, ${b}, 0.14)`, '--primary-line': `rgba(${r}, ${g}, ${b}, 0.35)`, '--on-primary': claro(pref.destaque) ? '#101421' : '#FFFFFF' });
    }
    for (const [v, x] of Object.entries(vars)) { if (x) html.style.setProperty(v, x); else html.style.removeProperty(v); }
    aplicarFundo();
  }

  // Minimal Premium: nome da página no topo e pontos por indicador em lista com barras
  const partes0 = partesContrib, rosca0 = grafRosca, moldura0 = renderMoldura;
  partesContrib = function (res) {
    return premium() ? INDICADORES.map(i => ({ nome: i.curto, v: res.por[i.id].pts, max: res.por[i.id].max })) : partes0(res);
  };
  grafRosca = function (el, partes, centro, sub) {
    if (!premium()) { rosca0(el, partes, centro, sub); return; }
    const total = soma(partes.map(p => p.max));
    el.innerHTML = `<div class="pts-lista"><div class="pts-topo"><strong>${centro}</strong><span>de ${nf(total)} ${sub}</span></div>
      ${partes.map(p => `<div class="pts-linha"><span>${esc(p.nome)}</span><b>${nf(p.v)} <small>/ ${nf(p.max)}</small></b><span class="pts-barra"><i style="width:${p.max ? Math.min(100, p.v / p.max * 100) : 0}%"></i></span></div>`).join('')}</div>`;
  };
  renderMoldura = function () {
    moldura0();
    const t = document.querySelector('.top-t strong'), p = PAGINAS.find(x => x[0] === S.pagina);
    if (t) t.textContent = premium() && p ? p[2] : 'Radar da Certificação';
  };

  // Painel "Aparência" no menu do usuário
  window.montarAparencia = function () {
    const box = document.getElementById('ap-box');
    if (!box) return;
    const seg = (attr, atual, ops, travar) => `<div class="seg">${ops.map(([v, t]) => `<button type="button" ${attr}="${v}" aria-pressed="${atual === v}"${travar ? ' disabled title="O Minimal Premium é sempre escuro"' : ''}>${t}</button>`).join('')}</div>`;
    box.innerHTML = `<b>Aparência</b>
      <div class="ap-l"><span>Visual</span>${seg('data-ap-visual', pref.visual, [['classico', 'Clássico'], ['premium', 'Minimal Premium']])}</div>
      <div class="ap-l"><span>Modo</span>${seg('data-ap-modo', pref.modo, [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']], premium())}</div>
      <div class="ap-l"><span>Cor de destaque</span><div class="sws">${CORES.map(([n, c]) => `<button type="button" class="sw${c ? '' : ' sw-padrao'}" data-ap-cor="${c || ''}" aria-pressed="${pref.destaque === c}" title="${n}" aria-label="Cor de destaque: ${n}"${c ? ` style="background:${c}"` : ''}></button>`).join('')}
        <label class="sw sw-mais" title="Escolher outra cor"><input type="color" id="ap-cor" value="${pref.destaque || '#4277F4'}" aria-label="Escolher outra cor de destaque"></label></div></div>
      <div class="ap-l"><span>Plano de fundo</span>${seg('data-ap-fundo', pref.fundo, FUNDOS)}</div>
      ${pref.fundo === 'nenhum' ? '' : `<div class="ap-l"><span>Cor do fundo</span><div class="sws">${CORES_FUNDO.map(([n, c]) => `<button type="button" class="sw${c ? '' : ' sw-auto'}" data-ap-fundo-cor="${c || ''}" aria-pressed="${pref.fundoCor === c}" title="${n}" aria-label="Cor do fundo: ${n}"${c ? ` style="background:${c}"` : ''}></button>`).join('')}
        <label class="sw sw-mais" title="Escolher outra cor"><input type="color" id="ap-fundo-cor" value="${pref.fundoCor || '#3B82F6'}" aria-label="Escolher outra cor para o fundo"></label></div></div>
      <div class="ap-l"><span>Movimento do fundo</span>${seg('data-ap-mov', pref.movimento, [['suave', 'Suave'], ['parado', 'Parado']])}</div>`}`;
  };
  const redesenhar = () => { if (S.calc) { renderMoldura(); renderPagina(); } };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ap-visual], [data-ap-modo], [data-ap-cor], [data-ap-fundo], [data-ap-fundo-cor], [data-ap-mov]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.apFundo || 'apFundoCor' in d || d.apMov) {
      // o fundo não muda o conteúdo das telas: basta aplicar, sem redesenhar a página
      if (d.apFundo) pref.fundo = d.apFundo;
      else if (d.apMov) pref.movimento = d.apMov;
      else pref.fundoCor = d.apFundoCor || null;
      salvar(); aplicar(); window.montarAparencia();
      return;
    }
    if (d.apVisual) pref.visual = d.apVisual;
    else if (d.apModo) pref.modo = d.apModo;
    else pref.destaque = d.apCor || null;
    salvar(); aplicar(); window.montarAparencia(); redesenhar();
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'ap-cor') { pref.destaque = e.target.value; salvar(); aplicar(); }
    else if (e.target.id === 'ap-fundo-cor') { pref.fundoCor = e.target.value; salvar(); aplicarFundo(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'ap-cor') { window.montarAparencia(); redesenhar(); }
    else if (e.target.id === 'ap-fundo-cor') window.montarAparencia();
  });

  aplicar();
  window.montarAparencia();
  redesenhar();
})();
