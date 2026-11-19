// Capa de video que se inyecta en la app SOLO durante la grabación (no forma parte del producto).
// Rótulo inferior por paso, cursor visible, infografía del cálculo, viñeta de Lucía y fundidos.
// También oculta el avatar con iniciales y los avisos técnicos (toasts) para no mostrar datos personales ni ruido.
(() => {
  const css = `
  .avatar { visibility: hidden !important; }
  .toast { display: none !important; }
  #film { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font-family: 'Inter Variable', Inter, 'Segoe UI', sans-serif; }
  #film .lt { position: absolute; left: 236px; right: 16px; bottom: 10px; height: 98px; background: #17142f; border-radius: 16px; display: flex; align-items: center; gap: 18px; padding: 0 24px; box-shadow: 0 10px 30px rgba(23,20,47,.35); transform: translateY(130px); transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  #film .lt.on { opacity: 1; transform: none; }
  #film .lt .chip { flex: none; background: #6336e8; color: #fff; font-weight: 800; font-size: 17px; padding: 8px 14px; border-radius: 999px; letter-spacing: .02em; }
  #film .lt .tt { font-size: 25px; font-weight: 750; color: #fff; letter-spacing: -.01em; line-height: 1.15; }
  #film .lt .st { font-size: 15.5px; color: #c9c6e4; margin-top: 4px; }
  #film .lt .sim { margin-left: auto; flex: none; font-size: 12.5px; color: #a7a3c9; text-align: right; line-height: 1.35; }
  #film .ffacts { position: absolute; left: 260px; top: 150px; display: grid; gap: 10px; }
  #film .ffact { background: #fff; border-radius: 14px; padding: 12px 18px; box-shadow: 0 10px 30px rgba(23,20,47,.18); font-size: 22px; font-weight: 750; color: #17142f; opacity: 0; transform: translateX(-16px); transition: all .45s cubic-bezier(.2,.8,.2,1); display: flex; gap: 10px; align-items: center; }
  #film .ffact.on { opacity: 1; transform: none; }
  #film .ffact small { font-size: 14px; color: #667085; font-weight: 600; }
  #film .ffact.warn { border-left: 6px solid #f59e0b; }
  #film .ffact.good { border-left: 6px solid #16a34a; }
  #film .ffact.purple { border-left: 6px solid #6336e8; }
  #film .lucia { position: absolute; left: 262px; bottom: 124px; display: flex; align-items: center; gap: 12px; opacity: 0; transform: translateY(12px) scale(.96); transition: all .4s cubic-bezier(.2,.8,.2,1); }
  #film .lucia.on { opacity: 1; transform: none; }
  #film .lucia .bubble { background: #fff; border-radius: 16px; padding: 12px 18px; font-size: 20px; font-weight: 750; color: #17142f; box-shadow: 0 10px 30px rgba(23,20,47,.2); }
  #film .cur { position: absolute; left: 700px; top: 420px; width: 28px; height: 28px; transition: left .75s cubic-bezier(.45,.05,.25,1), top .75s cubic-bezier(.45,.05,.25,1), opacity .3s; opacity: 0; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  #film .cur.on { opacity: 1; }
  #film .ring { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; border: 3px solid #7c4dff; opacity: 0; }
  #film .ring.go { animation: filmring .55s ease-out; }
  @keyframes filmring { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.4); } }
  #film .veil { position: absolute; inset: 0; opacity: 0; transition: opacity .6s ease; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'film';
  root.innerHTML = `
    <div class="veil"></div>
    <div class="ffacts"></div>
    <div class="lucia"><svg width="74" height="74" viewBox="-40 -64 80 80"><circle cx="0" cy="-12" r="38" fill="#efe9ff"/><circle cx="0" cy="-30" r="21" fill="#c98b62"/><path d="M-22 -32 Q-22 -56 0 -55 Q22 -56 22 -32 Q16 -44 0 -45 Q-14 -44 -22 -32 Z" fill="#2b1d16"/><circle cx="16" cy="-52" r="9" fill="#2b1d16"/><circle cx="-7" cy="-30" r="2.2" fill="#2b1d16"/><circle cx="8" cy="-30" r="2.2" fill="#2b1d16"/><path d="M-5 -20 Q0 -16 5 -20" stroke="#7a3e2a" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M-30 16 Q-30 -6 -12 -6 L12 -6 Q30 -6 30 16 Z" fill="#6336e8"/></svg><div class="bubble"></div></div>
    <div class="lt"><span class="chip"></span><div><div class="tt"></div><div class="st"></div></div><div class="sim">Demo simulada<br>lecturas RFID y datos ficticios</div></div>
    <div class="ring"></div>
    <svg class="cur" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.8 L11.6 14 L18 14 Z" fill="#fff" stroke="#17142f" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  window.__film = {
    caption(chip, title, sub = '') {
      const lt = $('.lt');
      const apply = () => { $('.chip').textContent = chip; $('.tt').textContent = title; $('.st').textContent = sub; $('.st').style.display = sub ? '' : 'none'; lt.classList.add('on'); };
      if (lt.classList.contains('on') && $('.chip').textContent !== chip) { lt.classList.remove('on'); setTimeout(apply, 260); } else apply();
    },
    sub(text) { $('.st').textContent = text; $('.st').style.display = text ? '' : 'none'; },
    hideCaption() { $('.lt').classList.remove('on'); },
    fact(html, tone = '') { const d = document.createElement('div'); d.className = `ffact ${tone}`; d.innerHTML = html; $('.ffacts').appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('on'))); },
    clearFacts() { const f = $('.ffacts'); [...f.children].forEach((c) => c.classList.remove('on')); setTimeout(() => { f.innerHTML = ''; }, 450); },
    factsAt(left, top) { Object.assign($('.ffacts').style, { left: `${left}px`, top: `${top}px` }); },
    lucia(text) { $('.lucia .bubble').textContent = text; $('.lucia').classList.add('on'); },
    hideLucia() { $('.lucia').classList.remove('on'); },
    cursorTo(x, y) { const c = $('.cur'); c.classList.add('on'); c.style.left = `${x - 4}px`; c.style.top = `${y - 2}px`; },
    hideCursor() { $('.cur').classList.remove('on'); },
    pulse(x, y) { const r = $('.ring'); r.style.left = `${x}px`; r.style.top = `${y}px`; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); },
    veil(color, on) { const v = $('.veil'); v.style.background = color; v.style.opacity = on ? 1 : 0; },
    veilNow(color) { const v = $('.veil'); v.style.transition = 'none'; v.style.background = color; v.style.opacity = 1; void v.offsetWidth; v.style.transition = ''; },
  };
})();
