/* Aparência: visual (Clássico ou Minimal Premium), modo claro/escuro e cor de destaque.
   A escolha fica guardada neste navegador e vale só para quem a fez. */
(function () {
  'use strict';
  const CHAVE = 'radar-aparencia';
  const PADRAO = { visual: 'classico', modo: 'auto', destaque: null };
  const CORES = [['Padrão', null], ['Azul', '#4277F4'], ['Verde', '#16A34A'], ['Roxo', '#7C3AED'], ['Ciano', '#0891B2'], ['Laranja', '#EA580C'], ['Vermelho', '#DC2626']];
  let pref = { ...PADRAO };
  try { pref = { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch (e) { /* sem armazenamento: usa o padrão */ }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(pref)); } catch (e) { /* navegador sem armazenamento */ } };
  const premium = () => pref.visual === 'premium';
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const clarear = (h, t) => '#' + rgb(h).map(x => Math.round(x + (255 - x) * t).toString(16).padStart(2, '0')).join('');
  const claro = h => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6; };

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
        <label class="sw sw-mais" title="Escolher outra cor"><input type="color" id="ap-cor" value="${pref.destaque || '#4277F4'}" aria-label="Escolher outra cor de destaque"></label></div></div>`;
  };
  const redesenhar = () => { if (S.calc) { renderMoldura(); renderPagina(); } };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ap-visual], [data-ap-modo], [data-ap-cor]');
    if (!b || b.disabled) return;
    if (b.dataset.apVisual) pref.visual = b.dataset.apVisual;
    else if (b.dataset.apModo) pref.modo = b.dataset.apModo;
    else pref.destaque = b.dataset.apCor || null;
    salvar(); aplicar(); window.montarAparencia(); redesenhar();
  });
  document.addEventListener('input', e => { if (e.target.id === 'ap-cor') { pref.destaque = e.target.value; salvar(); aplicar(); } });
  document.addEventListener('change', e => { if (e.target.id === 'ap-cor') { window.montarAparencia(); redesenhar(); } });

  aplicar();
  window.montarAparencia();
  redesenhar();
})();
